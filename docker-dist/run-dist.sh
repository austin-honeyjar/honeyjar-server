#!/bin/bash

# Script to run the Honeyjar Server from distributed Docker image
echo "Starting Honeyjar Server and PostgreSQL..."

# Check if the image is already loaded
if [[ -z $(docker images -q honeyjar-server-image:latest) ]]; then
  # If image doesn't exist, try to load it
  echo "Loading Docker image from tar file..."
  if [[ -f "honeyjar-server-image.tar" ]]; then
    docker load -i honeyjar-server-image.tar
  else
    echo "Error: honeyjar-server-image.tar not found!"
    echo "Please make sure the image file is in the current directory."
    exit 1
  fi
fi

# Check if .env file exists, if not create an example one
if [ ! -f ".env" ]; then
  echo "No .env file found. Creating an example .env file..."
  echo "# Honeyjar Server Environment Variables
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
" > .env
  echo ".env file created. Please edit it with your actual API keys and secrets before continuing."
  exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
  echo "Docker Compose is not installed. Please install Docker Compose first."
  exit 1
fi

# Run Docker Compose to start both server and database
echo "Starting containers with Docker Compose..."
docker-compose up -d

echo "Honeyjar Server is running on http://localhost:3005"
echo "PostgreSQL database is running on localhost:5432"
echo "To view container logs: docker-compose logs"
echo "To stop all containers: docker-compose down"
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  User: postgres"
echo "  Password: Password1"
echo "  Database: client_db" 