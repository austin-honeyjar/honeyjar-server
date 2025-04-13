# Honeyjar Server

A Node.js server for the Honeyjar application, providing API endpoints for CSV processing and chat functionality.

## Local Development

### Prerequisites

- Node.js 20 or later
- Docker Desktop
- PostgreSQL 15 or later
- Clerk account for authentication

### Environment Setup

1. Create a `.env` file in the root directory with the following variables:
```env
NODE_ENV=devlocal
DATABASE_URL=postgres://postgres:Password1@localhost:5432/client_db
CLERK_SECRET_KEY=your_clerk_secret_key
```

### Running with Docker Compose

The easiest way to run the server locally is using Docker Compose:

```bash
# Start the server and database
docker-compose up --build

# The server will be available at http://localhost:3005
```

This will:
- Start the server with hot-reloading enabled
- Start a PostgreSQL database
- Mount your local code for development
- Persist database data in a Docker volume

### Running without Docker

If you prefer to run the server directly:

```bash
# Install dependencies
npm install

# Start the server
npm run dev
```

## Google Cloud Deployment

### Prerequisites

- Google Cloud account
- Google Cloud SDK installed
- Project created in Google Cloud Console

### Setup

1. Configure your project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

2. Enable required APIs:
```bash
gcloud services enable cloudbuild.googleapis.com run.googleapis.com
```

3. Set up secrets in Google Cloud:
```bash
# Create secrets for sensitive data
gcloud secrets create DATABASE_URL --data-file=/path/to/your/database-url
gcloud secrets create CLERK_SECRET_KEY --data-file=/path/to/your/clerk-key
```

### Deployment

The project uses Cloud Build for continuous deployment. When you push to your repository, it will automatically:

1. Build the Docker image
2. Push it to Google Container Registry
3. Deploy to Cloud Run

The deployment is configured in `cloudbuild.yaml` and will:
- Use a high-CPU machine for faster builds
- Deploy to Cloud Run in us-central1
- Set environment variables from secrets
- Allow unauthenticated access (you can change this if needed)

### Manual Deployment

If you need to deploy manually:

```bash
# Build and push the image
gcloud builds submit --config cloudbuild.yaml

# Deploy to Cloud Run
gcloud run deploy honeyjar-server \
  --image gcr.io/YOUR_PROJECT_ID/honeyjar-server:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```## API Documentation

The API documentation is available at:
- Local: http://localhost:3005/api-docs
- Production: https://honeyjar-server-xxxxx-uc.a.run.app/api-docs

## Project Structure

```
.
├── src/                    # Source code
│   ├── config/            # Configuration files
│   ├── controllers/       # Route controllers
│   ├── db/               # Database setup and migrations
│   ├── middleware/       # Express middleware
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   └── validators/      # Request validation schemas
├── migrations/           # Database migrations
├── scripts/             # Utility scripts
├── Dockerfile          # Docker build configuration
├── docker-compose.yml  # Local development setup
├── cloudbuild.yaml     # Google Cloud Build configuration
└── package.json        # Project dependencies
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Submit a pull request

## License

[Your License Here] 

# Honeyjar Server

API server for the Honeyjar application, handling CSV file management and data storage.

## Features

- CSV file upload and management
- Dynamic table creation based on CSV structure
- RESTful API endpoints
- Error handling and logging
- Input validation
- PostgreSQL database integration

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/honeyjar-server.git
   cd honeyjar-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3001
   PG_USER=postgres
   PG_HOST=localhost
   PG_DATABASE=client_db
   PG_PASSWORD=your_password
   PG_PORT=5432
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/client_db
   NODE_ENV=development
   LOG_LEVEL=debug
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### CSV Management

#### Create Table from CSV
- **POST** `/api/csv/tables`
- **Request Body**:
  ```json
  {
    "columns": ["column1", "column2", "column3"],
    "data": [
      ["value1", "value2", "value3"],
      ["value4", "value5", "value6"]
    ],
    "fileName": "example.csv"
  }
  ```

#### Get All Tables
- **GET** `/api/csv/tables`
- **Response**:
  ```json
  [
    {
      "id": 1,
      "tableName": "csv_example_1234567890",
      "fileName": "example.csv",
      "columnNames": ["column1", "column2", "column3"],
      "data": [
        {
          "id": 1,
          "column1": "value1",
          "column2": "value2",
          "column3": "value3"
        }
      ]
    }
  ]
  ```

#### Delete Table
- **DELETE** `/api/csv/tables?tableName=csv_example_1234567890`

### Health Check
- **GET** `/health`
- **Response**:
  ```json
  {
    "status": "ok"
  }
  ```

## Development

To start the server in development mode:

```bash
npm run dev
```

This will start the server in devlocal mode with hot reloading enabled.

### Running Tests
```bash
npm test
```

### Database Migrations
```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

## License

MIT 

## Environment Variables

The following environment variables are required:

- `NODE_ENV`: The environment to run in (devlocal, production) 