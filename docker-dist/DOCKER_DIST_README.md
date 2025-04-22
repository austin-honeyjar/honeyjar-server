# Honeyjar Server - Docker Distribution Package

This package allows you to run the Honeyjar Server without requiring access to the source code.

## Contents

- `honeyjar-server-image.tar` - Pre-built Docker image for the Honeyjar Server
- `docker-compose.dist.yml` - Docker Compose configuration for running the server with PostgreSQL
- `run-dist.sh` - Shell script for Linux/Mac users
- `run-dist.ps1` - PowerShell script for Windows users

## Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your machine
- [Docker Compose](https://docs.docker.com/compose/install/) installed on your machine

## Quick Start

### For Windows Users:

1. Make sure Docker Desktop is running
2. Open PowerShell and navigate to this directory
3. Run the PowerShell script:
   ```
   .\run-dist.ps1
   ```

### For Linux/Mac Users:

1. Make sure Docker is running
2. Open a terminal and navigate to this directory
3. Make the shell script executable:
   ```
   chmod +x run-dist.sh
   ```
4. Run the shell script:
   ```
   ./run-dist.sh
   ```

## Manual Setup

If you prefer to run the commands manually:

1. Load the Docker image:
   ```
   docker load -i honeyjar-server-image.tar
   ```

2. Create a `.env` file with your CLERK_SECRET_KEY:
   ```
   CLERK_SECRET_KEY=your_key_here
   ```

3. Start the containers:
   ```
   docker-compose -f docker-compose.dist.yml up -d
   ```

## Services

This Docker setup starts two services:

1. **Honeyjar Server**: Running on port 3005
2. **PostgreSQL Database**: Running on port 5433
   - User: postgres
   - Password: Password1
   - Database: client_db

## Troubleshooting

- **Port conflicts**: If ports 3005 or 5433 are already in use, modify the port mappings in docker-compose.dist.yml
- **Image loading issues**: Make sure you run `docker load` before attempting to start the containers
- **Containers not starting**: Check the logs with `docker-compose -f docker-compose.dist.yml logs`

## Configuration

The provided environment variables can be adjusted in the .env file or in docker-compose.dist.yml if needed.

## Contact

If you encounter any issues or have questions about this distribution package, please contact the package provider. 