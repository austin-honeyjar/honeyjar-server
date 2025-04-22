# Honeyjar Server Docker Setup

This document provides instructions for running the Honeyjar Server with a PostgreSQL database in Docker containers.

## Directory Structure

This directory contains all files needed to run the Honeyjar Server with Docker:

- `docker-compose.yml` - Docker Compose configuration for both server and database
- `Dockerfile.dev` - Development Dockerfile for the server
- `run-docker.ps1` - PowerShell script for Windows users
- `run-docker.sh` - Bash script for Linux/Mac users
- `README.md` - This documentation file

## Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your machine
- [Docker Compose](https://docs.docker.com/compose/install/) installed on your machine

## Quick Start

### For Windows Users:

1. Make sure Docker Desktop is running
2. Open PowerShell and navigate to the `docker-setup` directory
3. Run the PowerShell script:
   ```
   .\run-docker.ps1
   ```

### For Linux/Mac Users:

1. Make sure Docker is running
2. Open a terminal and navigate to the `docker-setup` directory
3. Make the shell script executable:
   ```
   chmod +x run-docker.sh
   ```
4. Run the shell script:
   ```
   ./run-docker.sh
   ```

## What's Included

This Docker setup includes:

1. **Honeyjar Server**: Running on port 3005
2. **PostgreSQL Database**: Running on port 5433
   - User: postgres
   - Password: Password1  
   - Database: client_db
   - Connection URL: postgres://postgres:Password1@localhost:5433/client_db

## Using Docker Compose Manually

If you prefer to run the commands manually:

1. Navigate to the `docker-setup` directory
2. Create a `.env` file with the necessary environment variables (at minimum, set CLERK_SECRET_KEY)
3. Run:
   ```
   docker-compose up -d
   ```

This will start both the server and a PostgreSQL database.

## Common Docker Compose Commands

- View logs:
  ```
  docker-compose logs
  ```
- View logs for a specific service:
  ```
  docker-compose logs server
  docker-compose logs db
  ```
- Stop all containers:
  ```
  docker-compose down
  ```
- Restart all containers:
  ```
  docker-compose restart
  ```
- Rebuild and restart containers:
  ```
  docker-compose up -d --build
  ```

## Troubleshooting

- **Port conflicts**: If ports 3005 or 5433 are already in use, modify the port mappings in docker-compose.yml
- **Database connection**: The server will automatically connect to the database using the environment variables
- **Containers not starting**: Check the logs with `docker-compose logs`

## Environment Variables

The following environment variables can be set in your `.env` file:

- `NODE_ENV`: Environment (development, production, etc.)
- `CLERK_SECRET_KEY`: Your Clerk authentication secret key
- Add any other required environment variables

Note: You don't need to set DATABASE_URL manually as it's configured in the docker-compose.yml file.

## Sharing the Docker Setup

To share this Docker setup with another developer:

1. Share the entire `docker-setup` directory as a zip file

## Connecting to the Database

You can connect to the PostgreSQL database using any standard PostgreSQL client:

- Host: localhost
- Port: 5433
- Username: postgres
- Password: Password1
- Database: client_db

## Contact

If you encounter any issues or have questions about the Docker setup, please contact the repository maintainer. 