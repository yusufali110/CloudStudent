# AWS EKS Setup & Deployment Guide for Beginners

This guide walks you step-by-step through setting up an Amazon Elastic Kubernetes Service (EKS) cluster and deploying the CloudStudent application.

---

## 1. Prerequisites Checklist

Before creating any cloud resources, install and verify these CLI tools on your Windows machine:

1. **AWS CLI v2**:
   ```powershell
   aws --version
   aws configure
   # Enter AWS Access Key ID, Secret Access Key, Region (e.g. us-east-1), and Output (json)
   ```
2. **eksctl** (Official CLI for Amazon EKS):
   ```powershell
   # Install via Chocolatey:
   choco install eksctl
   # Or Scoop:
   scoop install eksctl
   eksctl version
   ```
3. **kubectl** (Kubernetes CLI):
   ```powershell
   kubectl version --client
   ```
4. **Helm** (Kubernetes Package Manager):
   ```powershell
   choco install kubernetes-helm
   helm version
   ```

---

## 2. Step 1: Create the EKS Cluster with `eksctl`

We recommend a lightweight 2-node cluster using `t3.medium` instances to balance performance and cost.

Create a cluster configuration file or run the following command in PowerShell:

```powershell
eksctl create cluster `
  --name cloudstudent-cluster `
  --region us-east-1 `
  --version 1.29 `
  --nodegroup-name standard-workers `
  --node-type t3.medium `
  --nodes 2 `
  --nodes-min 2 `
  --nodes-max 4 `
  --managed
```

> [!NOTE]
> Cluster creation typically takes **15 to 20 minutes**. `eksctl` automatically creates the VPC, subnets, route tables, security groups, EKS control plane, and worker node group, and updates your local `~/.kube/config`.

Verify connection to your new cluster:
```powershell
kubectl get nodes
```

---

## 3. Step 2: Enable IAM Roles for Service Accounts (IRSA)

EKS uses OpenID Connect (OIDC) to grant Kubernetes ServiceAccounts permissions to access AWS services (like EBS and ALB):

```powershell
eksctl utils associate-iam-oidc-provider `
  --cluster cloudstudent-cluster `
  --region us-east-1 `
  --approve
```

---

## 4. Step 3: Install the Amazon EBS CSI Driver

Kubernetes requires the AWS EBS CSI driver to dynamically provision Amazon EBS volumes for MongoDB.

1. **Create the IAM Role and Service Account for EBS CSI**:
   ```powershell
   eksctl create iamserviceaccount `
     --name ebs-csi-controller-sa `
     --namespace kube-system `
     --cluster cloudstudent-cluster `
     --region us-east-1 `
     --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy `
     --approve `
     --role-only `
     --role-name AmazonEKS_EBS_CSI_DriverRole
   ```

2. **Install the EKS Add-on**:
   ```powershell
   $ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)

   eksctl create addon `
     --name aws-ebs-csi-driver `
     --cluster cloudstudent-cluster `
     --region us-east-1 `
     --service-account-role-arn "arn:aws:iam::$ACCOUNT_ID`:role/AmazonEKS_EBS_CSI_DriverRole" `
     --force
   ```

3. **Verify the driver pods are running**:
   ```powershell
   kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
   ```

---

## 5. Step 4: Install AWS Load Balancer Controller (for Ingress ALB)

The AWS Load Balancer Controller translates Kubernetes `Ingress` resources into real AWS Application Load Balancers.

1. **Download IAM Policy**:
   ```powershell
   Invoke-WebRequest -Uri https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json -OutFile iam_policy.json
   aws iam create-policy --policy-name AWSLoadBalancerControllerIAMPolicy --policy-document file://iam_policy.json
   ```

2. **Create ServiceAccount for the Controller**:
   ```powershell
   $ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)

   eksctl create iamserviceaccount `
     --cluster cloudstudent-cluster `
     --namespace kube-system `
     --name aws-load-balancer-controller `
     --role-name AmazonEKSLoadBalancerControllerRole `
     --attach-policy-arn "arn:aws:iam::$ACCOUNT_ID`:policy/AWSLoadBalancerControllerIAMPolicy" `
     --approve
   ```

3. **Install Controller via Helm**:
   ```powershell
   helm repo add eks https://aws.github.io/eks-charts
   helm repo update

   helm install aws-load-balancer-controller eks/aws-load-balancer-controller `
     -n kube-system `
     --set clusterName=cloudstudent-cluster `
     --set serviceAccount.create=false `
     --set serviceAccount.name=aws-load-balancer-controller
   ```

4. **Verify Controller Pod**:
   ```powershell
   kubectl get deployment -n kube-system aws-load-balancer-controller
   ```

---

## 6. Step 5: Build Images and Deploy CloudStudent

1. **Build and Push Images to Amazon ECR**:
   ```powershell
   .\scripts\ecr-build-push.ps1 -AwsRegion us-east-1
   ```
   *Note the returned ECR Registry URI (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com`).*

2. **Deploy to EKS**:
   ```powershell
   .\scripts\eks-deploy.ps1 -EcrRegistry "123456789012.dkr.ecr.us-east-1.amazonaws.com"
   ```

3. **Retrieve the Public Web URL**:
   ```powershell
   kubectl get ingress cloudstudent-ingress -n cloudstudent
   ```
   Open the address in your browser: `http://k8s-cloudstu-xxxxxxxxxx.us-east-1.elb.amazonaws.com`

---

## 7. Alternative Quick Access (No Ingress Controller)

If you prefer to test without setting up the AWS Load Balancer Controller:
```powershell
.\scripts\eks-deploy.ps1 -EcrRegistry "123456789012.dkr.ecr.us-east-1.amazonaws.com" -UseLoadBalancerService
```
This automatically converts `frontend-service` to `type: LoadBalancer`, triggering AWS to create a standard Classic/Network Load Balancer immediately.
