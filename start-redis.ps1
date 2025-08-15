# PowerShell script to start Redis for testing
Write-Host "🚀 Starting Redis container for Honeyjar testing..." -ForegroundColor Green

# Stop and remove existing Redis container if it exists
docker stop honeyjar-redis 2>$null
docker rm honeyjar-redis 2>$null

# Start Redis container
docker run -d `
  --name honeyjar-redis `
  -p 6379:6379 `
  -v honeyjar-redis-data:/data `
  redis:7-alpine redis-server --appendonly yes

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Redis container started successfully!" -ForegroundColor Green
    Write-Host "📋 Container name: honeyjar-redis" -ForegroundColor Yellow
    Write-Host "🔌 Available at: localhost:6379" -ForegroundColor Yellow
    Write-Host "" 
    Write-Host "To test the connection, run:" -ForegroundColor Cyan
    Write-Host "docker exec honeyjar-redis redis-cli ping" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop Redis later, run:" -ForegroundColor Cyan
    Write-Host "docker stop honeyjar-redis" -ForegroundColor Gray
} else {
    Write-Host "❌ Failed to start Redis container" -ForegroundColor Red
    Write-Host "Make sure Docker Desktop is running" -ForegroundColor Yellow
}
