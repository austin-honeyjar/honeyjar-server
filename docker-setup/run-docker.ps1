# PowerShell script to run the Honeyjar Server in Docker
Write-Host "Starting Honeyjar Server and PostgreSQL..." -ForegroundColor Green

# Get the parent directory path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# Navigate to the root directory
Set-Location $rootDir

# Check if .env file exists, if not create an example one
if (-not (Test-Path ".env")) {
    Write-Host "No .env file found. Creating an example .env file..." -ForegroundColor Yellow
    @"
# Honeyjar Server Environment Variables
NODE_ENV=development
# Add other required environment variables here
CLERK_SECRET_KEY=your_clerk_secret_key
"@ | Out-File -FilePath ".env" -Encoding utf8
    
    Write-Host ".env file created. Please edit it with your actual environment variables before continuing." -ForegroundColor Red
    exit 1
}

# Check if docker-compose is installed
$dockerComposeVersion = docker-compose --version 2>$null
if (-not $?) {
    Write-Host "Docker Compose is not installed or not in PATH. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Run Docker Compose to start both server and database
Write-Host "Starting containers with Docker Compose..." -ForegroundColor Green
docker-compose -f docker-setup/docker-compose.yml up -d

Write-Host "Honeyjar Server is running on http://localhost:3005" -ForegroundColor Green
Write-Host "PostgreSQL database is running on localhost:5433" -ForegroundColor Green
Write-Host "To view container logs: docker-compose -f docker-setup/docker-compose.yml logs" -ForegroundColor Cyan
Write-Host "To stop all containers: docker-compose -f docker-setup/docker-compose.yml down" -ForegroundColor Cyan
Write-Host "Database connection details:" -ForegroundColor Yellow
Write-Host "  Host: localhost" -ForegroundColor Yellow
Write-Host "  Port: 5433" -ForegroundColor Yellow
Write-Host "  User: postgres" -ForegroundColor Yellow
Write-Host "  Password: Password1" -ForegroundColor Yellow
Write-Host "  Database: client_db" -ForegroundColor Yellow 