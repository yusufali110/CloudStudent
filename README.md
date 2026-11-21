# CloudStudent – 3-Tier Student Management System

A containerized Student Management System built using Docker, Node.js, MongoDB, Kubernetes and AWS EKS.

## Project Overview

CloudStudent is a 3-tier application designed to demonstrate modern DevOps practices, containerization and Kubernetes deployment.

## Architecture

```text
          User
           |
           v
      Frontend (NGINX)
           |
           v
      Backend (Node.js)
           |
           v
       MongoDB
```

## Technologies Used

- **Frontend:** HTML, CSS, JavaScript, NGINX
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Containerization:** Docker, Docker Compose
- **Orchestration:** Kubernetes
- **Cloud:** AWS EKS, AWS ECR
- **Storage:** Kubernetes PV and PVC
- **Scaling:** Horizontal Pod Autoscaler (HPA)

## Project Features

- Student management functionality
- 3-tier application architecture
- Docker containerization
- Multi-container deployment using Docker Compose
- Kubernetes Deployments and Services
- MongoDB StatefulSet
- Persistent Volume and Persistent Volume Claim
- Kubernetes ConfigMaps and Secrets
- Resource Quotas and RBAC
- Horizontal Pod Autoscaling
- AWS EKS deployment configuration

## Project Structure

```text
CloudStudent/
├── backend/
├── frontend/
├── docs/
├── k8s/
├── k8s-local/
├── scripts/
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Run Locally

### Prerequisites
- Docker Desktop
- Git

### Start Application

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Stop application:

```bash
docker compose down
```

## Kubernetes Deployment

Kubernetes deployment manifests are available in the `k8s/` directory.

AWS EKS deployment instructions are available in:

`docs/aws-eks-guide.md`

## Learning Objectives

This project helped me practice:

- Linux and DevOps fundamentals
- Docker and containerization
- Kubernetes resource management
- AWS cloud deployment concepts
- Application deployment and troubleshooting
- Git and GitHub version control

## Author

**Yusuf Khayyat**

GitHub: https://github.com/yusufali110

Project: https://github.com/yusufali110/CloudStudent
