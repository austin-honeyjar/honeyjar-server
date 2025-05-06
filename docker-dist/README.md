# Honeyjar Server - Docker Distribution Package

This package allows you to run the Honeyjar Server without requiring access to the source code.

## Contents

- `honeyjar-server-image.tar` - Pre-built Docker image for the Honeyjar Server
- `docker-compose.yml` - Docker Compose configuration for running the server with PostgreSQL
- `init-db.sql` - SQL script to initialize the database schema
- `run-dist.ps1` - PowerShell script for Windows users
- `run-dist.sh` - Shell script for Linux/Mac users

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

2. Create a `.env` file with required environment variables:
   ```
   CLERK_SECRET_KEY=your_clerk_secret_key_here
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4-turbo-preview
   ```

3. Start the containers:
   ```
   docker-compose up -d
   ```

## Database Initialization

The database schema is automatically initialized when the PostgreSQL container starts for the first time. This setup includes:

- **Chat System Tables**:
  - `chat_threads`: Stores information about chat conversations
  - `chat_messages`: Stores individual messages in each conversation

- **Workflow System Tables**:
  - `workflow_templates`: Stores workflow templates
  - `workflows`: Stores active workflows
  - `workflow_steps`: Stores steps within each workflow
  - `workflow_history`: Tracks workflow execution history

- **Data Management Tables**:
  - `csv_metadata`: Stores metadata about imported CSV files
  
- **Asset Management Tables**:
  - `assets`: Stores content assets created during workflows

The database schema incorporates all migrations from the Drizzle ORM migration files, ensuring:
- Safe enum type creation with proper error handling
- Proper foreign key relationships between tables
- Support for asset creation workflow steps
- OpenAI prompt and response tracking in workflow steps

If you need to manually reinitialize the database:

1. Ensure the database container is running
2. Run:
   ```
   docker-compose exec db psql -U postgres -d client_db -f /docker-entrypoint-initdb.d/01-init.sql
   ```

## Services

This Docker setup starts two services:

1. **Honeyjar Server**: Running on port 3005
2. **PostgreSQL Database**: Running on port 5432
   - User: postgres
   - Password: Password1
   - Database: client_db

## Troubleshooting

- **Port conflicts**: If ports 3005 or 5432 are already in use, modify the port mappings in docker-compose.yml
- **Database errors**: If you see relation/table not found errors, the database schema may not have initialized correctly. Try the manual initialization steps above.
- **Container not starting**: Check the logs with `docker-compose logs`

## Configuration

All required environment variables can be set in the .env file.

## Contact

If you encounter any issues or have questions about this distribution package, please contact the package provider. 