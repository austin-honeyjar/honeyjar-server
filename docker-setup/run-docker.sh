#!/bin/bash

# Script to run the Honeyjar Server and PostgreSQL in Docker
echo "Starting Honeyjar Server and PostgreSQL..."

# Get the parent directory path
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Navigate to the root directory
cd "$ROOT_DIR"

# Check if .env file exists, if not create an example one
if [ ! -f ".env" ]; then
  echo "No .env file found. Creating an example .env file..."
  echo "# Honeyjar Server Environment Variables
NODE_ENV=development
# Add other required environment variables here
CLERK_SECRET_KEY=your_clerk_secret_key
" > .env
  echo ".env file created. Please edit it with your actual environment variables before continuing."
  exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
  echo "Docker Compose is not installed. Please install Docker Compose first."
  exit 1
fi

# Run Docker Compose to start both server and database
echo "Starting containers with Docker Compose..."
docker-compose -f docker-setup/docker-compose.yml up -d

echo "Honeyjar Server is running on http://localhost:3005"
echo "PostgreSQL database is running on localhost:5433"
echo "To view container logs: docker-compose -f docker-setup/docker-compose.yml logs"
echo "To stop all containers: docker-compose -f docker-setup/docker-compose.yml down"
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5433"
echo "  User: postgres"
echo "  Password: Password1"
echo "  Database: client_db" 