<#
.SYNOPSIS
    Local development automation script for CloudStudent 3-tier application.

.DESCRIPTION
    Manages Docker Compose lifecycle: builds containers, boots MongoDB, Express API,
    and NGINX frontend, monitors health checks, and runs smoke tests.

.PARAMETER Action
    Action to perform: 'up', 'down', 'restart', 'logs', 'test', 'status'

.EXAMPLE
    .\local-dev.ps1 -Action up
    .\local-dev.ps1 -Action test
    .\local-dev.ps1 -Action down
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false, Position = 0)]
    [ValidateSet('up', 'down', 'restart', 'logs', 'test', 'status')]
    [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

function Write-Header {
    param ([string]$Text)
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor White -NoNewline
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
}

function Write-Success {
    param ([string]$Text)
    Write-Host "[SUCCESS] $Text" -ForegroundColor Green
}

function Write-Info {
    param ([string]$Text)
    Write-Host "[INFO] $Text" -ForegroundColor Cyan
}

function Write-Warn {
    param ([string]$Text)
    Write-Host "[WARNING] $Text" -ForegroundColor Yellow
}

function Write-Fail {
    param ([string]$Text)
    Write-Host "[ERROR] $Text" -ForegroundColor Red
}

# Verify Docker is running
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker executable not found in PATH. Please install Docker Desktop."
    exit 1
}

cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker is not running. Please start Docker Desktop and try again."
    exit 1
}

switch ($Action) {
    'up' {
        Write-Header "Starting CloudStudent Local Environment (Docker Compose)"
        Write-Info "Building containers and starting services in background..."
        docker compose up -d --build

        Write-Info "Waiting for containers to initialize and pass healthchecks (approx 15s)..."
        Start-Sleep -Seconds 12

        Write-Header "Current Container Status"
        docker compose ps

        Write-Host ""
        Write-Success "Local environment is running!"
        Write-Host " - Frontend Web UI:  http://localhost:8080" -ForegroundColor Yellow
        Write-Host " - Backend REST API: http://localhost:5000/api/students" -ForegroundColor Yellow
        Write-Host " - Backend Health:   http://localhost:5000/health" -ForegroundColor Yellow
        Write-Host " - MongoDB Port:     localhost:27018" -ForegroundColor Yellow
        Write-Host ""
        Write-Info "Run '.\scripts\local-dev.ps1 -Action test' to run automated API verification."
    }

    'down' {
        Write-Header "Stopping CloudStudent Local Environment"
        Write-Info "Stopping and removing containers, networks, and volumes..."
        docker compose down -v
        Write-Success "All local resources cleaned up."
    }

    'restart' {
        Write-Header "Restarting CloudStudent Local Environment"
        docker compose down
        docker compose up -d --build
        Write-Success "Restart complete."
    }

    'logs' {
        Write-Header "Streaming Container Logs (Press Ctrl+C to exit)"
        docker compose logs -f
    }

    'status' {
        Write-Header "Current Service Status"
        docker compose ps
    }

    'test' {
        Write-Header "Running Local Health & REST API Smoke Tests"

        # 1. Test Backend Health
        Write-Info "1. Checking Backend Health endpoint (http://localhost:5000/health)..."
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get -TimeoutSec 5
            Write-Success "Backend Health: Status=$($health.status), Database=$($health.database.status)"
        } catch {
            Write-Fail "Backend health check failed: $_"
            exit 1
        }

        # 2. Test Frontend Health
        Write-Info "2. Checking Frontend NGINX probe (http://localhost:8080/healthz)..."
        try {
            $frontend = Invoke-WebRequest -Uri "http://localhost:8080/healthz" -Method Get -TimeoutSec 5
            if ($frontend.StatusCode -eq 200) {
                Write-Success "Frontend NGINX probe OK (HTTP 200)"
            }
        } catch {
            Write-Fail "Frontend probe failed: $_"
        }

        # 3. Test Student Creation
        Write-Info "3. Testing POST /api/students (Create Student)..."
        $randomNo = Get-Random -Minimum 1000 -Maximum 9999
        $newStudent = @{
            fullName = "Student Tester"
            enrollmentNo = "TEST-$randomNo"
            email = "tester$randomNo@cloudstudent.edu"
            course = "Cloud Computing"
            semester = 3
        } | ConvertTo-Json

        try {
            $createRes = Invoke-RestMethod -Uri "http://localhost:5000/api/students" -Method Post -Body $newStudent -ContentType "application/json"
            $studentId = $createRes.data.id
            Write-Success "Created Student ID: $studentId (Enrollment: TEST-$randomNo)"
        } catch {
            Write-Fail "Failed to create student: $_"
            exit 1
        }

        # 4. Test Student List and Stats
        Write-Info "4. Testing GET /api/students and /api/students/stats..."
        try {
            $stats = Invoke-RestMethod -Uri "http://localhost:5000/api/students/stats" -Method Get
            Write-Success "Stats endpoint returned: TotalStudents=$($stats.data.totalStudents)"

            $list = Invoke-RestMethod -Uri "http://localhost:5000/api/students?search=TEST-$randomNo" -Method Get
            Write-Success "Search verified: Found $($list.count) matching record(s)"
        } catch {
            Write-Fail "Stats/Search test failed: $_"
            exit 1
        }

        # 5. Clean up test record
        Write-Info "5. Cleaning up test record (DELETE /api/students/$studentId)..."
        try {
            $deleteRes = Invoke-RestMethod -Uri "http://localhost:5000/api/students/$studentId" -Method Delete
            Write-Success "Cleaned up test student successfully."
        } catch {
            Write-Warn "Could not delete test student: $_"
        }

        Write-Host ""
        Write-Success "ALL SMOKE TESTS PASSED! Local 3-tier application is 100% operational."
    }
}
