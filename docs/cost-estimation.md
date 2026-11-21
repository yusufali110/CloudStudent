# AWS Cloud Cost Estimation & Financial Governance

This document details the exact cost categories associated with running CloudStudent on AWS EKS and provides best practices to keep your learning expenses close to zero.

---

## 1. Itemized Cost Breakdown (US-East / N. Virginia)

| Resource Component | Quantity / Specs | Estimated Hourly Cost | Estimated Monthly Cost | Free Tier Applicable? |
| :--- | :--- | :--- | :--- | :--- |
| **Amazon EKS Control Plane** | 1 Managed Cluster | $0.10 / hr | ~$73.00 / month | ❌ No |
| **Amazon EC2 Worker Nodes** | 2 × `t3.medium` (2 vCPU, 4GB RAM) | $0.0416 × 2 = $0.0832 / hr | ~$60.00 / month | ❌ No (`t2.micro` / `t3.micro` are free tier, but too small for EKS system pods) |
| **AWS Application Load Balancer (ALB)** | 1 Ingress Load Balancer | $0.0225 / hr + LCU | ~$18.00 / month | ❌ Partial (750 hrs free in month 1 for Classic/NLB only) |
| **Amazon EBS Storage (gp3)** | 5 GB Persistent Volume | $0.08 / GB / month | $0.40 / month | ✅ Yes (Up to 30 GB gp2/gp3 free for 12 mos) |
| **Amazon ECR Image Registry** | ~200 MB container images | $0.10 / GB / month | ~$0.02 / month | ✅ Yes (500 MB free per month) |
| **AWS NAT Gateway** *(Optional)* | 1 NAT Gateway (if using private subnets) | $0.045 / hr + data | ~$32.40 / month | ❌ No |
| **Total Estimated Run Cost** | Full 3-Tier Cluster | **~$0.25 / hour** | **~$183.80 / month** | — |

---

## 2. Key Insights for Students & Cloud Beginners

> [!CAUTION]
> **Do not leave the EKS cluster running 24/7 if you are paying out-of-pocket.**
> The EKS Control Plane alone costs $0.10/hour ($2.40/day) regardless of whether your application is receiving traffic or not.

### The 3-Hour Learning Session Cost
If you spin up the cluster, deploy CloudStudent, test the features, and run `cleanup.ps1` followed by `eksctl delete cluster` within **3 hours**:
$$\text{Total Cost} = 3\text{ hours} \times \$0.25/\text{hour} \approx \mathbf{\$0.75 \text{ (Less than } \$1.00\text{ USD)}}$$

---

## 3. High Availability, HPA, and Capacity Considerations

1. **Horizontal Pod Autoscaler (HPA)**:
   - When HPA scales the backend from 2 replicas to 6 replicas under load, the cluster must have sufficient CPU and memory.
   - If your worker nodes run out of capacity, newly spawned pods will remain in the `Pending` state with the event `0/2 nodes are available: 2 Insufficient cpu`.
2. **DaemonSets**:
   - The example DaemonSet (`cloudstudent-node-monitor`) places 1 pod on *every* worker node. As you add nodes to your cluster, memory and CPU reservation increases proportionally.
3. **StorageClass Multi-AZ Locking**:
   - Amazon EBS volumes cannot span Availability Zones. By using `volumeBindingMode: WaitForFirstConsumer` in `04-storageclass.yaml`, you prevent stranded EBS volume charges.

---

## 4. Tactics to Minimize Your AWS Bill

1. **Use EC2 Spot Instances**:
   Save up to 70% on worker node compute by requesting Spot capacity:
   ```powershell
   eksctl create nodegroup --cluster cloudstudent-cluster --name spot-workers --spot --instance-types t3.medium,t3a.medium --nodes 2
   ```
2. **Use Public Subnets for Learning (Avoid NAT Gateway)**:
   The standard `eksctl create cluster` command places nodes in public subnets with internet gateways, which **incurs $0 NAT Gateway charges**.
3. **Always Run Teardown When Finished**:
   When you complete your laboratory study, execute:
   ```powershell
   .\scripts\cleanup.ps1
   eksctl delete cluster --name cloudstudent-cluster --region us-east-1
   ```
4. **Set Up an AWS Billing Alarm**:
   - Open AWS CloudWatch -> Alarms -> Billing.
   - Create an alarm to send an email notification if total monthly spend exceeds **$5.00**.
