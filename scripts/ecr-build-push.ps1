<#
.SYNOPSIS
    Builds and pushes CloudStudent Docker images to Amazon Elastic Container Registry (ECR).

.DESCRIPTION
    1. Authenticates against AWS using AWS CLI.
    2. Retrieves current AWS Account ID and validates region.
    3. Provisions ECR repositories if they do not exist.
    4. Authenticates Docker daemon to Amazon ECR.
    5. Builds multi-architecture/Linux container images.
    6. Tags and pushes 'cloudstudent-frontend' and 'cloudstudent-backend' images.

.PARAMETER AwsRegion
    The AWS Region where your ECR repositories are hosted (Default: 'us-east-1').

.PARAMETER AwsAccountId
    Your 12-digit AWS Account ID. If omitted, automatically determined via AWS STS.

.PARAMETER Tag
    Image tag to apply (Default: 'latest').

.PARAMETER SkipConfirmation
    Bypasses interactive confirmation.
#>

[CmdletBinding()]
param (
    [string]$AwsRegion = "us-east-1",
    [string]$AwsAccountId = "",
    [string]$Tag = "latest",
    [switch]$SkipConfirmation
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

function Write-Step {
    param ([string]$Msg)
    Write-Host "`n>>> [STEP] $Msg" -ForegroundColor Cyan
}

function Write-Success {
    param ([string]$Msg)
    Write-Host "[SUCCESS] $Msg" -ForegroundColor Green
}

function Write-Fail {
    param ([string]$Msg)
    Write-Host "[ERROR] $Msg" -ForegroundColor Red
}

function Write-Warn {
    param ([string]$Msg)
    Write-Host "[WARNING] $Msg" -ForegroundColor Yellow
}

# 1. Pre-flight checks
Write-Step "Checking prerequisites (AWS CLI & Docker)..."

try {
    $null = Get-Command aws -ErrorAction Stop
    Write-Success "AWS CLI is installed."
} catch {
    Write-Fail "AWS CLI is not installed or not in PATH. Download from: https://aws.amazon.com/cli/"
    exit 1
}

try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    Write-Success "Docker engine is running."
} catch {
    Write-Fail "Docker is not running. Please start Docker Desktop before pushing images."
    exit 1
}

# 2. AWS Authentication Check
Write-Step "Validating AWS credentials..."
try {
    $callerIdentity = aws sts get-caller-identity --output json | ConvertFrom-Json
    if (-not $AwsAccountId) {
        $AwsAccountId = $callerIdentity.Account
    }
    Write-Success "Authenticated as IAM Principal: $($callerIdentity.Arn)"
    Write-Host "AWS Account ID : $AwsAccountId" -ForegroundColor White
    Write-Host "AWS Region     : $AwsRegion" -ForegroundColor White
} catch {
    Write-Fail "Failed to authenticate with AWS. Run 'aws configure' first."
    exit 1
}

# 3. Cost & Action Warning
Write-Host ""
Write-Warn "COST NOTICE: Amazon ECR charges ~$0.10 per GB/month for container image storage."
Write-Warn "This script will create 2 ECR repositories and push ~100MB of container images."

if (-not $SkipConfirmation) {
    $confirm = Read-Host "`nDo you want to proceed with ECR repository creation and image push? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Operation cancelled by user." -ForegroundColor Yellow
        exit 0
    }
}

$RegistryUrl = "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"
$BackendRepo = "cloudstudent-backend"
$FrontendRepo = "cloudstudent-frontend"

# 4. Create ECR Repositories if missing
function Ensure-EcrRepo {
    param ([string]$RepoName)
    Write-Step "Checking ECR repository '$RepoName'..."
    $exists = aws ecr describe-repositories --repository-names $RepoName --region $AwsRegion 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Repository '$RepoName' does not exist. Creating..." -ForegroundColor Yellow
        aws ecr create-repository `
            --repository-name $RepoName `
            --image-scanning-configuration scanOnPush=true `
            --encryption-configuration encryptionType=AES256 `
            --region $AwsRegion | Out-Null
        Write-Success "Created ECR repository '$RepoName'."
    } else {
        Write-Success "Repository '$RepoName' already exists."
    }
}

Ensure-EcrRepo -RepoName $BackendRepo
Ensure-EcrRepo -RepoName $FrontendRepo

# 5. Authenticate Docker to ECR
Write-Step "Authenticating Docker with Amazon ECR ($RegistryUrl)..."
aws ecr get-login-password --region $AwsRegion | docker login --username AWS --password-stdin $RegistryUrl
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker ECR authentication failed."
    exit 1
}
Write-Success "Docker authenticated to ECR successfully."

# 6. Build and Push Backend Image
$BackendLocal = "$BackendRepo`:$Tag"
$BackendRemote = "$RegistryUrl/$BackendRepo`:$Tag"

Write-Step "Building Backend Docker image (Linux/amd64)..."
docker build --platform linux/amd64 -t $BackendLocal -t $BackendRemote "$ProjectRoot/backend"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend Docker build failed."
    exit 1
}
Write-Success "Backend Docker image built."

Write-Step "Pushing Backend image to ECR ($BackendRemote)..."
docker push $BackendRemote
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend Docker push failed."
    exit 1
}
Write-Success "Backend image pushed successfully."

# 7. Build and Push Frontend Image
$FrontendLocal = "$FrontendRepo`:$Tag"
$FrontendRemote = "$RegistryUrl/$FrontendRepo`:$Tag"

Write-Step "Building Frontend Docker image (Linux/amd64)..."
docker build --platform linux/amd64 -t $FrontendLocal -t $FrontendRemote "$ProjectRoot/frontend"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Frontend Docker build failed."
    exit 1
}
Write-Success "Frontend Docker image built."

Write-Step "Pushing Frontend image to ECR ($FrontendRemote)..."
docker push $FrontendRemote
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Frontend Docker push failed."
    exit 1
}
Write-Success "Frontend image pushed successfully."

# Summary
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  IMAGE BUILD & PUSH COMPLETED SUCCESSFULLY" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Backend Image URI : $BackendRemote" -ForegroundColor Yellow
Write-Host "Frontend Image URI: $FrontendRemote" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next Step: You can now deploy these images to your EKS cluster using:" -ForegroundColor Cyan
Write-Host "  .\scripts\eks-deploy.ps1 -EcrRegistry $RegistryUrl" -ForegroundColor White
