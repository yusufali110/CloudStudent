# CloudStudent Troubleshooting & Diagnostics Guide

This guide is designed for beginners encountering common issues in Docker, Kubernetes, and AWS EKS.

---

## Quick Diagnostic Commands Cheat-Sheet

```powershell
# 1. View all resources in the namespace
kubectl get all,pvc,ingress -n cloudstudent -o wide

# 2. Inspect events and describe a failing Pod
kubectl describe pod <pod-name> -n cloudstudent

# 3. Stream real-time container logs
kubectl logs <pod-name> -n cloudstudent --tail=100 -f

# 4. View logs for a previously crashed container
kubectl logs <pod-name> -n cloudstudent --previous

# 5. Execute an interactive shell inside a running pod
kubectl exec -it <pod-name> -n cloudstudent -- /bin/sh
```

---

## 1. Pod in `CrashLoopBackOff`

### Symptom:
A pod enters `CrashLoopBackOff`, restarting repeatedly.

### Causes & Fixes:
1. **MongoDB Connection Failure**:
   - Check backend logs:
     ```powershell
     kubectl logs -l app.kubernetes.io/component=backend -n cloudstudent
     ```
   - If you see `[MongoDB] Connection attempt failed`, ensure the `mongo-0` pod is in `Running` state and the headless service is resolvable.
2. **Missing Environment Variable or Secret**:
   - Verify that the ConfigMap and Secret are applied:
     ```powershell
     kubectl get configmap,secret -n cloudstudent
     ```

---

## 2. Pod in `Pending` State

### Symptom:
Pod stays in `Pending` indefinitely and is never scheduled.

### Diagnosis:
Run:
```powershell
kubectl describe pod <pod-name> -n cloudstudent
```
Look at the **Events** section at the bottom.

### Common Causes:
1. **`0/2 nodes are available: 2 Insufficient cpu / memory`**:
   - Your EC2 worker nodes are out of allocatable compute capacity.
   - Solution: Scale your worker nodes (`eksctl scale nodegroup --cluster=cloudstudent-cluster --name=standard-workers --nodes=3`) or reduce the pod CPU/memory requests in `k8s/06-backend-deployment.yaml`.
2. **`exceeded quota: cloudstudent-quota`**:
   - The namespace has hit the hard limits defined in `02-limitrange-quota.yaml`.
   - Solution: Check usage with `kubectl describe resourcequota -n cloudstudent`.

---

## 3. PersistentVolumeClaim (PVC) Stuck in `Pending`

### Symptom:
The MongoDB PVC `mongo-data-mongo-0` shows `STATUS: Pending` and the volume is never provisioned.

### Diagnosis:
```powershell
kubectl describe pvc mongo-data-mongo-0 -n cloudstudent
```

### Solutions:
1. **`waiting for first consumer to be created before binding`**:
   - **This is NORMAL behavior!** Because our StorageClass uses `volumeBindingMode: WaitForFirstConsumer`, Kubernetes waits until the `mongo-0` pod is scheduled onto a node before creating the AWS EBS volume in that node's Availability Zone.
2. **`driver name ebs.csi.aws.com not found in the list of registered CSI drivers`**:
   - The Amazon EBS CSI Driver add-on is missing.
   - Install the add-on following [AWS EKS Guide](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/aws-eks-guide.md).
3. **`UnauthorizedOperation / WebIdentityErr`**:
   - The EBS CSI driver's IAM role does not have the `AmazonEBSCSIDriverPolicy` attached, or the OIDC provider was not associated with the cluster.

---

## 4. `ImagePullBackOff` or `ErrImagePull`

### Symptom:
Kubernetes cannot pull the container image from Amazon ECR.

### Causes & Fixes:
1. **Typo in Image URI**:
   - Verify that your image URI in `06-backend-deployment.yaml` and `07-frontend-deployment.yaml` matches your AWS Account ID and region:
     `<account-id>.dkr.ecr.<region>.amazonaws.com/cloudstudent-backend:latest`
2. **Worker Node IAM Permissions**:
   - EKS worker nodes require the `AmazonEC2ContainerRegistryReadOnly` IAM policy attached to their instance role to pull from private ECR repositories.
3. **Image Does Not Exist in ECR**:
   - Check if you pushed the images:
     ```powershell
     aws ecr list-images --repository-name cloudstudent-backend --region us-east-1
     ```

---

## 5. AWS Ingress ALB Address Not Generated

### Symptom:
Running `kubectl get ingress -n cloudstudent` leaves the `ADDRESS` field blank.

### Solutions:
1. Check the AWS Load Balancer Controller logs:
   ```powershell
   kubectl logs -n kube-system deployment/aws-load-balancer-controller
   ```
2. **Missing Subnet Tags**:
   The AWS ALB controller requires your public VPC subnets to have the following tag to identify where to place the Application Load Balancer:
   - Key: `kubernetes.io/role/elb`
   - Value: `1`
3. Fallback:
   If you do not want to configure an Ingress Controller, patch the frontend service to create an AWS Classic/Network Load Balancer directly:
   ```powershell
   kubectl patch svc frontend-service -n cloudstudent -p '{"spec": {"type": "LoadBalancer"}}'
   ```

---

## 6. Docker Compose Local Troubleshooting

If services fail locally:
```powershell
# 1. Check all container logs
docker compose logs -f

# 2. Verify MongoDB responds to health ping
docker exec -it cloudstudent-db mongosh -u admin -p password123 --eval "db.adminCommand('ping')"

# 3. Test Backend health endpoint directly
curl http://localhost:5000/health

# 4. Rebuild from scratch without cache
docker compose down -v
docker compose build --no-cache
docker compose up -d
```
