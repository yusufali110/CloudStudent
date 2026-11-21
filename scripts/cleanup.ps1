<#
.SYNOPSIS
    Cleans up all CloudStudent Kubernetes resources and provides instructions
    to delete EKS and AWS billable resources safely.

.DESCRIPTION
    Tears down resources in reverse dependency order:
    1. Ingress (triggers AWS Load Balancer Controller to remove the ALB).
    2. Frontend & Backend Deployments, Services, and HPA.
    3. MongoDB StatefulSet and PersistentVolumeClaims (deletes AWS EBS volumes).
    4. RBAC, LimitRange, Quota, ConfigMaps, and the 'cloudstudent' Namespace.
    5. Optionally guides user through complete EKS cluster and ECR deletion.

.PARAMETER DeleteEcr
    If set, also removes the ECR repositories for frontend and backend.

.PARAMETER SkipConfirmation
    Bypasses interactive confirmation.
#>

[CmdletBinding()]
param (
    [switch]$DeleteEcr,
    [switch]$SkipConfirmation
)

$ErrorActionPreference = 'Continue'
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

function Write-Warn {
    param ([string]$Msg)
    Write-Host "[WARNING] $Msg" -ForegroundColor Yellow
}

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "  CLOUDSTUDENT TEARDOWN & COST PROTECTION SCRIPT" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Red

if (-not $SkipConfirmation) {
    Write-Warn "This script will delete all pods, services, ingress, and persistent volumes in namespace 'cloudstudent'."
    $confirm = Read-Host "Are you sure you want to proceed with teardown? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Cleanup aborted." -ForegroundColor Yellow
        exit 0
    }
}

# 1. Delete Ingress first so AWS Load Balancer Controller deletes the ALB
Write-Step "Deleting Ingress (allows ALB deletion)..."
kubectl delete ingress cloudstudent-ingress -n cloudstudent --ignore-not-found=true
Write-Host "Waiting 20 seconds for AWS Load Balancer Controller to deprovision the ALB..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# 2. Delete Deployments, Services, and HPA
Write-Step "Deleting Application Tiers (Deployments, HPA, Services)..."
kubectl delete -f (Join-Path $K8sDir "08-hpa.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "07-frontend-deployment.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "06-backend-deployment.yaml") --ignore-not-found=true

# 3. Delete MongoDB StatefulSet and PersistentVolumeClaims
Write-Step "Deleting MongoDB StatefulSet and PersistentVolumeClaims..."
kubectl delete -f (Join-Path $K8sDir "05-mongodb-statefulset.yaml") --ignore-not-found=true
kubectl delete pvc -l app.kubernetes.io/name=cloudstudent -n cloudstudent --ignore-not-found=true

# 4. Delete Educational Manifests if applied
kubectl delete -f (Join-Path $K8sDir "10-daemonset-example.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "11-replicationcontroller-example.yaml") --ignore-not-found=true

# 5. Delete Config, Secrets, Quotas, RBAC, and Namespace
Write-Step "Deleting Config, Secrets, Quotas, and Namespace 'cloudstudent'..."
kubectl delete -f (Join-Path $K8sDir "03-configmap-secret.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "02-limitrange-quota.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "01-rbac.yaml") --ignore-not-found=true
kubectl delete -f (Join-Path $K8sDir "00-namespace.yaml") --ignore-not-found=true

Write-Success "Kubernetes resources in 'cloudstudent' namespace successfully removed."

# 6. Optional ECR Repository Deletion
if ($DeleteEcr) {
    Write-Step "Deleting Amazon ECR Repositories..."
    aws ecr delete-repository --repository-name cloudstudent-backend --force 2>$null
    aws ecr delete-repository --repository-name cloudstudent-frontend --force 2>$null
    Write-Success "ECR repositories deleted."
}

# 7. Final Instructions to avoid unexpected AWS charges
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "  HOW TO COMPLETELY DELETE REMAINING AWS BILLABLE ASSETS" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "To prevent ongoing AWS charges after your learning session:" -ForegroundColor White
Write-Host ""
Write-Host "1. Delete the EKS Cluster (using eksctl):" -ForegroundColor Cyan
Write-Host "   eksctl delete cluster --name <your-cluster-name> --region <your-region>" -ForegroundColor White
Write-Host ""
Write-Host "2. Verify Amazon EBS Volumes are deleted:" -ForegroundColor Cyan
Write-Host "   Open AWS EC2 Console -> Elastic Block Store -> Volumes" -ForegroundColor White
Write-Host "   Ensure no unused gp3 volumes with tag 'kubernetes.io/created-for/pvc' remain." -ForegroundColor White
Write-Host ""
Write-Host "3. Verify Application Load Balancers are deleted:" -ForegroundColor Cyan
Write-Host "   Open AWS EC2 Console -> Load Balancers" -ForegroundColor White
Write-Host "   Ensure any ALBs created for the ingress are deleted." -ForegroundColor White
Write-Host ""
Write-Host "4. Delete ECR Repositories (if not already deleted):" -ForegroundColor Cyan
Write-Host "   aws ecr delete-repository --repository-name cloudstudent-backend --force" -ForegroundColor White
Write-Host "   aws ecr delete-repository --repository-name cloudstudent-frontend --force" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Yellow
