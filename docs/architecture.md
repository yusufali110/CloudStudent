# CloudStudent Architecture & Technical Design

CloudStudent is architected following cloud-native best practices for 3-tier enterprise applications on Amazon Web Services (AWS) and Kubernetes (EKS).

---

## 1. High-Level Architecture Diagram

```
[ User Browser / Client ]
            │
            │ HTTP (Port 80) / HTTPS (Port 443)
            ▼
┌─────────────────────────────────────────────────────────────┐
│ AWS VPC (Virtual Private Cloud)                              │
│                                                             │
│  [ Public Subnets ]                                         │
│       │                                                     │
│       ▼                                                     │
│  [ AWS Application Load Balancer (ALB) ]                    │
│       │                                                     │
│       │ Target Type: IP (Routes directly to Pod IPs)        │
│       ▼                                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Amazon EKS Cluster (Namespace: cloudstudent)          │  │
│  │                                                       │  │
│  │  [ Web Tier ]                                         │  │
│  │  Frontend Deployment (NGINX Alpine, Replicas: 2)      │  │
│  │  - Serves static HTML5 / CSS / JS                     │  │
│  │  - Reverse-proxies /api/* to backend-service          │  │
│  │  - Service: frontend-service (ClusterIP: 80)          │  │
│  │        │                                              │  │
│  │        │ HTTP Internal Cluster Traffic (Port 5000)    │  │
│  │        ▼                                              │  │
│  │  [ Application Tier ]                                 │  │
│  │  Backend Deployment (Node.js / Express, Replicas: 2)  │  │
│  │  - RESTful APIs for CRUD and Statistics               │  │
│  │  - Input validation, Mongoose ODM                     │  │
│  │  - Health endpoints (/health) for Liveness/Readiness  │  │
│  │  - Auto-scaled via HPA (HorizontalPodAutoscaler)      │  │
│  │  - Service: backend-service (ClusterIP: 5000)         │  │
│  │        │                                              │  │
│  │        │ MongoDB Wire Protocol (Port 27017)           │  │
│  │        ▼                                              │  │
│  │  [ Data Tier - STRICTLY PRIVATE ]                     │  │
│  │  MongoDB StatefulSet (Pod: mongo-0)                   │  │
│  │  - Headless Service: mongo-headless (None:27017)      │  │
│  │  - NO Public LoadBalancer or NodePort                 │  │
│  │  - PersistentVolumeClaim (PVC)                        │  │
│  │        │                                              │  │
│  └────────┼──────────────────────────────────────────────┘  │
│           │                                                 │
│  [ Storage Tier ]                                           │
│       ▼                                                     │
│  Amazon EBS Volume (gp3, Provisioned dynamically via CSI)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tier-by-Tier Breakdown

### Web Tier (Frontend)
- **Container**: Minimal Alpine Linux running NGINX (`nginx:1.25-alpine`).
- **Function**:
  1. Serves static web assets (`index.html`, `style.css`, `app.js`).
  2. Acts as an edge reverse-proxy for the backend API, forwarding `/api/*` requests to `http://backend-service:5000/api/`. This design eliminates browser Cross-Origin Resource Sharing (CORS) issues and hides internal cluster endpoints.
  3. Provides an independent health check at `/healthz` returning HTTP 200 without loading application logic.
- **Scaling & Placement**: Managed via a Kubernetes `Deployment` with 2 replicas and pod anti-affinity to ensure high availability across worker nodes.

### Application Tier (Backend)
- **Container**: Node.js 20 LTS Alpine, running as non-privileged user `node` for security.
- **Framework**: Express.js with Mongoose ODM.
- **Endpoints**:
  - `GET /health`: Comprehensive health check validating MongoDB connectivity (used by Kubernetes Liveness & Readiness Probes).
  - `GET /api/students/stats`: Aggregates active student counts, course distributions, and semester metrics for the admin dashboard.
  - `GET /api/students`: Lists students with regex full-text search, course filtering, and pagination.
  - `POST /api/students`: Validates and registers new students with duplicate enrollment and email protection.
  - `PUT /api/students/:id`: Updates existing student details.
  - `DELETE /api/students/:id`: Permanently removes records from the database.
- **Resilience**: Configured with a startup probe (60s grace period) to prevent Kubernetes from killing the pod while waiting for the database connection.

### Data Tier (Database)
- **Workload Type**: Kubernetes `StatefulSet`.
- **Why StatefulSet instead of Deployment?**
  1. **Stable Network Identity**: The pod is always assigned the deterministic DNS hostname `mongo-0.mongo-headless.cloudstudent.svc.cluster.local`.
  2. **Dedicated Storage Association**: The `volumeClaimTemplates` guarantee that each database pod remains strictly bound to its own Amazon EBS volume even if the pod restarts or moves across nodes.
  3. **Headless Service**: `mongo-headless` uses `clusterIP: None` so requests bypass round-robin proxying and resolve directly to the active MongoDB instance.
- **Privacy & Security**: MongoDB has no ingress rule, no NodePort, and no public LoadBalancer. It is only reachable by pods inside the `cloudstudent` namespace.

### Storage Tier (Amazon EBS)
- **CSI Driver**: AWS Elastic Block Store (EBS) Container Storage Interface (CSI) driver (`ebs.csi.aws.com`).
- **Storage Class**: `ebs-gp3-sc` utilizing AWS `gp3` volumes with default encryption at rest.
- **Availability Zone Alignment**: Utilizes `volumeBindingMode: WaitForFirstConsumer` to ensure that the Amazon EBS volume is dynamically created in the exact same Availability Zone (e.g. `us-east-1a`) where the MongoDB pod is scheduled.

---

## 3. Network and Security Flow

1. **Ingress Routing**:
   - The user navigates to the AWS ALB public DNS.
   - The AWS Load Balancer Controller forwards incoming traffic on port 80 to the target pod IPs (`target-type: ip`).
2. **Namespace Isolation**:
   - All components reside in the `cloudstudent` namespace.
   - LimitRanges and ResourceQuotas ensure no pod exhausts EC2 node memory or CPU.
3. **RBAC Least Privilege**:
   - Workloads run under a dedicated `cloudstudent-sa` ServiceAccount with restricted read permissions to ConfigMaps and Secrets.
