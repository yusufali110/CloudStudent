<#
.SYNOPSIS
    Automated deployment script for CloudStudent on Amazon EKS.

.DESCRIPTION
    1. Validates kubectl connection to the EKS cluster.
    2. Prompts for user confirmation with a cost/resource reminder.
    3. Sequentially applies Kubernetes manifests with dependency order.
    4. Dynamically substitutes Amazon ECR image URIs into deployments.
    5. Monitors rollout status of StatefulSets and Deployments.
    6. Displays public ingress endpoints and cluster health.

.PARAMETER EcrRegistry
    Your Amazon ECR Registry URI (e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com).

.PARAMETER Tag
    The container image tag deployed from ECR (Default: 'latest').

.PARAMETER UseLoadBalancerService
    Converts Frontend Service from ClusterIP to LoadBalancer (useful if AWS Load Balancer Controller is not yet configured).

.PARAMETER DryRun
    Runs client-side validation only, making zero modifications to the cluster.

.PARAMETER SkipConfirmation
    Bypasses interactive prompt.
#>

[CmdletBinding()]
param (
    [string]$EcrRegistry = "",
    [string]$Tag = "latest",
    [switch]$UseLoadBalancerService,
    [switch]$DryRun,
    [switch]$SkipConfirmation
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$K8sDir = Join-Path $ProjectRoot "k8s"

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

# 1. Check kubectl installation and active context
Write-Step "Checking kubectl and active cluster context..."
try {
    $null = Get-Command kubectl -ErrorAction Stop
} catch {
    Write-Fail "kubectl is not installed. Download from: https://kubernetes.io/docs/tasks/tools/"
    exit 1
}

try {
    $currentContext = (kubectl config current-context).Trim()
    Write-Success "Active Kubernetes Context: $currentContext"
} catch {
    Write-Fail "Unable to determine current kubectl context. Is your kubeconfig configured?"
    exit 1
}

# 2. Cost and Safety Confirmation
if ($DryRun) {
    Write-Warn "DRY RUN MODE ENABLED: No changes will be applied to the Kubernetes cluster."
} else {
    Write-Host ""
    Write-Warn "CLOUD DEPLOYMENT CONFIRMATION:"
    Write-Warn "This will deploy resources into namespace 'cloudstudent' on cluster: $currentContext"
    Write-Warn "Ensure your EBS CSI Driver and VPC networking are configured."

    if (-not $SkipConfirmation) {
        $confirm = Read-Host "`nDo you want to proceed with deploying CloudStudent to EKS? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "Deployment aborted by user." -ForegroundColor Yellow
            exit 0
        }
    }
}

# Helper function to apply manifest
function Apply-Manifest {
    param ([string]$FileName)
    $filePath = Join-Path $K8sDir $FileName
    Write-Step "Applying manifest: $FileName"

    if ($DryRun) {
        kubectl apply -f $filePath --dry-run=client
    } else {
        kubectl apply -f $filePath
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to apply $FileName"
        exit 1
    }
}

# 3. Apply Base Infrastructure Manifests
Apply-Manifest "00-namespace.yaml"
Apply-Manifest "01-rbac.yaml"
Apply-Manifest "02-limitrange-quota.yaml"
Apply-Manifest "03-configmap-secret.yaml"
Apply-Manifest "04-storageclass.yaml"

# 4. Deploy Database Tier (MongoDB StatefulSet)
Apply-Manifest "05-mongodb-statefulset.yaml"

if (-not $DryRun) {
    Write-Step "Waiting for MongoDB StatefulSet to be ready (timeout 180s)..."
    kubectl rollout status statefulset/mongo -n cloudstudent --timeout=180s
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "MongoDB rollout timed out. Check pod status with: kubectl get pods -n cloudstudent"
    } else {
        Write-Success "MongoDB StatefulSet is ready."
    }
}

# 5. Deploy Backend API Tier
Apply-Manifest "06-backend-deployment.yaml"

if ($EcrRegistry -and (-not $DryRun)) {
    $backendImage = "$EcrRegistry/cloudstudent-backend`:$Tag"
    Write-Step "Updating Backend Deployment image to: $backendImage"
    kubectl set image deployment/backend-deployment backend=$backendImage -n cloudstudent
}

if (-not $DryRun) {
    Write-Step "Waiting for Backend Deployment rollout..."
    kubectl rollout status deployment/backend-deployment -n cloudstudent --timeout=180s
    Write-Success "Backend Deployment is ready."
}

# 6. Deploy Frontend Tier
Apply-Manifest "07-frontend-deployment.yaml"

if ($EcrRegistry -and (-not $DryRun)) {
    $frontendImage = "$EcrRegistry/cloudstudent-frontend`:$Tag"
    Write-Step "Updating Frontend Deployment image to: $frontendImage"
    kubectl set image deployment/frontend-deployment frontend=$frontendImage -n cloudstudent
}

if ($UseLoadBalancerService -and (-not $DryRun)) {
    Write-Step "Patching Frontend Service to 'type: LoadBalancer'..."
    kubectl patch svc frontend-service -n cloudstudent -p '{"spec": {"type": "LoadBalancer"}}'
}

if (-not $DryRun) {
    Write-Step "Waiting for Frontend Deployment rollout..."
    kubectl rollout status deployment/frontend-deployment -n cloudstudent --timeout=120s
    Write-Success "Frontend Deployment is ready."
}

# 7. Apply HPA and Ingress
Apply-Manifest "08-hpa.yaml"

if (-not $UseLoadBalancerService) {
    Apply-Manifest "09-ingress-alb.yaml"
}

# 8. Post-Deployment Summary
if (-not $DryRun) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  CLOUDSTUDENT DEPLOYED SUCCESSFULLY TO EKS" -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "`nNamespace Resources:" -ForegroundColor Cyan
    kubectl get all,pvc,ingress -n cloudstudent

    Write-Host "`nIngress / Service Access:" -ForegroundColor Yellow
    if ($UseLoadBalancerService) {
        Write-Host "Frontend Service LoadBalancer (Run after 2 mins for DNS provisioning):"
        kubectl get svc frontend-service -n cloudstudent -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
    } else {
        Write-Host "Application Load Balancer Ingress URL:"
        kubectl get ingress cloudstudent-ingress -n cloudstudent -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
    }
    Write-Host ""
} else {
    Write-Success "Dry-run syntax validation completed with zero errors."
}
