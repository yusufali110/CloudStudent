# CloudStudent — 3-Tier Student Management System on AWS EKS

![Architecture Badge](https://img.shields.io/badge/Architecture-3--Tier-blue.svg)
![Kubernetes Badge](https://img.shields.io/badge/Kubernetes-EKS%201.29-326CE5.svg)
![Docker Badge](https://img.shields.io/badge/Docker-Compose%20v2-2496ED.svg)
![NodeJS Badge](https://img.shields.io/badge/Backend-Node.js%2020-339933.svg)
![MongoDB Badge](https://img.shields.io/badge/Database-MongoDB%207.0-47A248.svg)

A beginner-friendly, production-grade 3-tier Student Management System engineered for learning **Cloud Computing, Docker, Kubernetes, and DevOps on AWS EKS**.

---

## 📖 Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Folder Structure](#folder-structure)
5. [Quick Start: Local Development (Docker Compose)](#quick-start-local-development-docker-compose)
6. [Deploying to Amazon EKS](#deploying-to-amazon-eks)
7. [Kubernetes Manifests Reference](#kubernetes-manifests-reference)
8. [Educational Deep Dives (HPA, DaemonSet, ReplicationController)](#educational-deep-dives)
9. [Financial Governance & Safe Teardown](#financial-governance--safe-teardown)
10. [Documentation Links](#documentation-links)

---

## 1. Project Overview

CloudStudent provides an intuitive administrative dashboard to manage student academic records while demonstrating enterprise cloud deployment patterns:
- **Admin Dashboard**: Live metrics on total students, active courses, and semester distributions.
- **Student CRUD**: Register, search, update, and delete students with interactive validation.
- **Modern UI**: Clean, responsive blue-and-white theme built with accessible HTML5, CSS3, and JavaScript.
- **Private Data Tier**: MongoDB is isolated inside a StatefulSet and **never** exposed to the public internet.
- **Storage Resilience**: Dynamic volume provisioning using the AWS EBS CSI driver and `gp3` storage class.

---

## 2. Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript, NGINX Alpine reverse proxy.
- **Backend API**: Node.js 20 LTS, Express.js, Mongoose ODM, Morgan logger.
- **Database**: MongoDB 7.0 Community Edition.
- **Containerization**: Docker, Docker Compose v2.
- **Cloud Infrastructure**: Amazon EKS, AWS Application Load Balancer (ALB), Amazon ECR, Amazon EBS.
- **Tooling**: Windows PowerShell, AWS CLI v2, eksctl, kubectl, helm.

---

## 3. Architecture Overview

```
Browser / Client (Port 80)
      │
      ▼
AWS Application Load Balancer (ALB Ingress)
      │
      ▼
Frontend Service (ClusterIP: 80) ──► NGINX Pods (Static UI & Proxy)
                                          │
                                          ▼ /api/* proxy
Backend Service (ClusterIP: 5000) ──► Node.js / Express Pods (REST API)
                                          │
                                          ▼ mongodb://mongo-headless:27017
Headless Service (ClusterIP: None) ──► MongoDB StatefulSet (mongo-0)
                                          │
                                          ▼ PVC (gp3-sc)
                                     Amazon EBS Volume (gp3)
```

---

## 4. Folder Structure

```
cloudstudent/
├── frontend/                        # Web Presentation Tier
│   ├── index.html                   # Dashboard UI with stats and modals
│   ├── style.css                    # Professional blue-and-white styling
│   ├── app.js                       # Interactive CRUD logic, live stats, validation
│   ├── nginx.conf                   # Static server, API reverse proxy, /healthz probe
│   ├── Dockerfile                   # NGINX alpine container build
│   └── .dockerignore
├── backend/                         # Application API Tier
│   ├── package.json                 # Node dependencies
│   ├── server.js                    # Express application, graceful shutdown, /health
│   ├── config/db.js                 # Resilient MongoDB connection with retry loop
│   ├── models/Student.js            # Mongoose schema with text indexes & validations
│   ├── routes/studentRoutes.js      # REST API CRUD + metrics statistics endpoint
│   ├── Dockerfile                   # Multi-stage lean production Dockerfile
│   ├── .dockerignore
│   └── .env.example
├── docker-compose.yml               # Local multi-tier orchestration
├── .gitignore                       # Credential and artifact protection
├── k8s/                             # Production Kubernetes Manifests
│   ├── 00-namespace.yaml            # Isolated 'cloudstudent' namespace
│   ├── 01-rbac.yaml                 # Least-privilege ServiceAccount, Role, RoleBinding
│   ├── 02-limitrange-quota.yaml     # ResourceQuota & LimitRange for cost governance
│   ├── 03-configmap-secret.yaml     # ConfigMap and Secret for configuration decoupling
│   ├── 04-storageclass.yaml         # AWS EBS gp3 dynamic StorageClass
│   ├── 05-mongodb-statefulset.yaml  # MongoDB StatefulSet + Headless Service + PVC
│   ├── 06-backend-deployment.yaml   # Backend Deployment + Service + Probes + Anti-affinity
│   ├── 07-frontend-deployment.yaml  # Frontend Deployment + Service + Probes
│   ├── 08-hpa.yaml                  # Horizontal Pod Autoscaler (CPU/Memory targets)
│   ├── 09-ingress-alb.yaml          # AWS Load Balancer Controller Ingress template
│   ├── 10-daemonset-example.yaml    # Node agent DaemonSet learning example
│   └── 11-replicationcontroller-example.yaml # Legacy ReplicationController demo
├── scripts/                         # Windows PowerShell Automation
│   ├── local-dev.ps1                # Start, stop, test local Docker Compose stack
│   ├── ecr-build-push.ps1           # AWS ECR login, build, tag, and push automation
│   ├── eks-deploy.ps1               # Automated Kubernetes rollout & verification
│   └── cleanup.ps1                  # Teardown script to delete resources safely
├── docs/                            # Deep Technical Guides
│   ├── architecture.md              # In-depth architectural & network flows
│   ├── aws-eks-guide.md             # eksctl, OIDC, EBS CSI, and ALB Controller setup
│   ├── cost-estimation.md           # AWS billing analysis, free-tier tips & cost controls
│   └── troubleshooting.md           # Common beginner errors (CrashLoop, Pending, etc.)
└── README.md                        # Master Documentation
```

---

## 5. Quick Start: Local Development (Docker Compose)

No AWS account is required for local development. Everything runs on your machine using Docker Desktop.

### Step 1: Start the Local Stack
Open Windows PowerShell in the project directory:
```powershell
cd cloudstudent
.\scripts\local-dev.ps1 -Action up
```
*Docker Compose will build the frontend and backend images, boot MongoDB, wait for health checks to pass, and display running service endpoints.*

### Step 2: Open the Application
- **Frontend Dashboard**: Open [http://localhost:80](http://localhost:80) in your web browser.
- **Backend Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **REST API Endpoint**: [http://localhost:5000/api/students](http://localhost:5000/api/students)

### Step 3: Run Automated Smoke Tests
Verify all API endpoints and database operations automatically:
```powershell
.\scripts\local-dev.ps1 -Action test
```

### Step 4: Stop the Local Stack
```powershell
.\scripts\local-dev.ps1 -Action down
```

---

## 6. Deploying to Amazon EKS

> [!IMPORTANT]
> Cloud resources will incur AWS charges. Review [docs/cost-estimation.md](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/cost-estimation.md) before deploying. Always run teardown when finished.

### Step 1: Create Cluster & Install Drivers
Follow the step-by-step instructions in [docs/aws-eks-guide.md](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/aws-eks-guide.md):
1. Create cluster: `eksctl create cluster --name cloudstudent-cluster --nodes 2 --node-type t3.medium`
2. Enable OIDC: `eksctl utils associate-iam-oidc-provider ...`
3. Install Amazon EBS CSI Driver addon.
4. Install AWS Load Balancer Controller (or use `-UseLoadBalancerService`).

### Step 2: Build and Push Images to Amazon ECR
```powershell
.\scripts\ecr-build-push.ps1 -AwsRegion us-east-1
```

### Step 3: Deploy to Kubernetes
```powershell
# Deploy with your ECR Registry:
.\scripts\eks-deploy.ps1 -EcrRegistry "123456789012.dkr.ecr.us-east-1.amazonaws.com"
```

---

## 7. Kubernetes Manifests Reference

| Manifest File | Key Kubernetes Concepts Illustrated |
| :--- | :--- |
| `00-namespace.yaml` | Multi-tenancy isolation and resource grouping. |
| `01-rbac.yaml` | ServiceAccounts, Roles, RoleBindings, and IAM IRSA linkage. |
| `02-limitrange-quota.yaml` | Default CPU/RAM container limits and namespace-wide hard caps. |
| `03-configmap-secret.yaml` | 12-factor configuration decoupling and Base64 stringData secrets. |
| `04-storageclass.yaml` | AWS EBS CSI provisioner (`gp3`) and `WaitForFirstConsumer` AZ alignment. |
| `05-mongodb-statefulset.yaml` | StatefulSet sticky pod identities (`mongo-0`), Headless Services, PVC templates. |
| `06-backend-deployment.yaml` | Pod Anti-Affinity, Rolling Updates, Startup, Readiness, & Liveness probes. |
| `07-frontend-deployment.yaml` | NGINX static serving, reverse proxying, and `/healthz` probes. |
| `08-hpa.yaml` | Horizontal Pod Autoscaling based on real-time CPU (70%) and Memory (80%). |
| `09-ingress-alb.yaml` | AWS Load Balancer Controller integration (`target-type: ip`). |
| `10-daemonset-example.yaml` | Node monitoring agent running 1 pod per worker node. |
| `11-replicationcontroller-example.yaml` | Legacy ReplicationController vs modern Deployments comparison. |

---

## 8. Educational Deep Dives

### HorizontalPodAutoscaler (HPA)
- Backend pods automatically scale between **2 and 6 replicas** as traffic increases.
- Requires Kubernetes `metrics-server` installed on your EKS cluster:
  ```powershell
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  ```
- Scale-down stabilization window is set to 300s to avoid flapping.

### DaemonSet vs Deployment
- While a Deployment balances pods based on an arbitrary replica count, a **DaemonSet** guarantees that *every* active EC2 worker node runs a copy of the monitoring pod. See `k8s/10-daemonset-example.yaml`.

### ReplicationController vs Deployment
- Early Kubernetes used equality-based `ReplicationController`. Modern systems use `Deployment` because it wraps `ReplicaSet` with declarative rollouts and instant rollback (`kubectl rollout undo`). See `k8s/11-replicationcontroller-example.yaml`.

---

## 9. Financial Governance & Safe Teardown

To avoid ongoing charges on your AWS bill:

1. **Delete CloudStudent Kubernetes Resources**:
   ```powershell
   .\scripts\cleanup.ps1 -DeleteEcr
   ```
2. **Delete the EKS Cluster**:
   ```powershell
   eksctl delete cluster --name cloudstudent-cluster --region us-east-1
   ```
3. **Verify in AWS Management Console**:
   - Check **EC2 Instances**: Terminated.
   - Check **EBS Volumes**: Deleted.
   - Check **Load Balancers**: Removed.

---

## 10. Documentation Links

- 🏛️ [Architecture & Network Flows](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/architecture.md)
- ☁️ [AWS EKS Setup & Configuration Guide](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/aws-eks-guide.md)
- 💰 [AWS Cost Estimation & Governance](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/cost-estimation.md)
- 🛠️ [Troubleshooting & Diagnostics Guide](file:///c:/Users/lenovo/OneDrive/Desktop/yusuf/cloudstudent/docs/troubleshooting.md)
