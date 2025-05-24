# PowerShell script to run the Honeyjar Server from distributed Docker image
Write-Host "Starting Honeyjar Server and PostgreSQL..." -ForegroundColor Green

# Check if the image is already loaded
$imageExists = docker images honeyjar-server:latest -q
if (-not $imageExists) {
    # If image doesn't exist, try to load it
    Write-Host "Loading Docker image from tar file..." -ForegroundColor Yellow
    if (Test-Path "honeyjar-server-image.tar") {
        docker load -i honeyjar-server-image.tar
    } else {
        Write-Host "Error: honeyjar-server-image.tar not found!" -ForegroundColor Red
        Write-Host "Please make sure the image file is in the current directory." -ForegroundColor Red
        exit 1
    }
}

# Check if .env file exists, if not create an example one
if (-not (Test-Path ".env")) {
    Write-Host "No .env file found. Creating an example .env file..." -ForegroundColor Yellow
    @"
# Honeyjar Server Environment Variables
# Replace with your actual API keys and secrets

# Authentication (Clerk)
CLERK_SECRET_KEY=your_clerk_secret_key_here
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# Database (automatically configured)
PG_USER=postgres
PG_PASSWORD=Password1
PG_HOST=db
PG_PORT=5432
PG_DATABASE=client_db
"@ | Out-File -FilePath ".env" -Encoding utf8
    
    Write-Host ".env file created. Please edit it with your actual API keys and secrets before continuing." -ForegroundColor Red
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
docker-compose up -d

Write-Host "Honeyjar Server is running on http://localhost:3005" -ForegroundColor Green
Write-Host "PostgreSQL database is running on localhost:5432" -ForegroundColor Green
Write-Host "To view container logs: docker-compose logs" -ForegroundColor Cyan
Write-Host "To stop all containers: docker-compose down" -ForegroundColor Cyan
Write-Host "Database connection details:" -ForegroundColor Yellow
Write-Host "  Host: localhost" -ForegroundColor Yellow
Write-Host "  Port: 5432" -ForegroundColor Yellow
Write-Host "  User: postgres" -ForegroundColor Yellow
Write-Host "  Password: Password1" -ForegroundColor Yellow
Write-Host "  Database: client_db" -ForegroundColor Yellow 