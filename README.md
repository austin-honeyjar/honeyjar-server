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
NODE_ENV=development
DATABASE_URL=postgres://postgres:Password1@localhost:5432/client_db
CLERK_SECRET_KEY=your_clerk_secret_key

# Metabase/LexisNexis API Configuration
METABASE_API_KEY=your_metabase_api_key_from_lexisnexis
METABASE_BASE_URL=http://metabase.moreover.com

# Source Changes API (for monitoring source additions/removals)
METABASE_USERNAME=your_lexisnexis_portal_username
METABASE_PASSWORD=your_lexisnexis_portal_password

# JWT Configuration (for dev tokens)
JWT_SECRET=your_jwt_secret_for_development
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
```

## API Documentation

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

This will start the server in development mode with hot reloading enabled.

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

- `NODE_ENV`: The environment to run in (development, production) 

## Metabase/LexisNexis Integration

### Overview
This server provides a comprehensive integration with the LexisNexis Metabase API for news data consumption, following the official documentation specifications.

### Features Implemented ✅

#### Core Endpoints
- **Articles Retrieval**: `/api/v1/partners/articles` - Basic article fetching
- **Article Search**: `/api/v1/partners/articles/search` - Advanced search with query parameters
- **Trending Topics**: `/api/v1/partners/trending-topics` - Popular topics analysis
- **Revoked Articles**: `/api/v1/partners/revoked-articles` - **Daily compliance requirement**
- **News Sources**: `/api/v1/partners/sources` - Available news sources
- **Source Changes**: `/api/v1/partners/sources/changes` - Monitor source additions/removals

#### Advanced Features
- **Sequential Processing**: `sequenceId` parameter to avoid duplicate articles
- **Load Balancing**: `numberOfSlices` and `sliceIndex` for parallel downloaders
- **Rate Limiting**: 20-second minimum between calls (validated)
- **License Compliance**: Automatic article clicking for royalty payments
- **Multiple Formats**: XML (default), JSON, RSS, Atom support
- **Compression**: `compact=true` parameter for smaller responses
- **Error Handling**: Complete Metabase error code coverage (1000-9999)

#### Developer Features
- **Dev Authentication**: `/api/v1/partners/dev-login` (dev/dev, admin/admin)
- **Rate Limit Checking**: `/api/v1/partners/rate-limit/check`
- **Compliance Processing**: `/api/v1/partners/articles/compliance`
- **Comprehensive Logging**: Detailed debug output with emojis
- **Swagger Documentation**: Complete API docs at `/api-docs`

### Usage Examples

#### Basic Article Retrieval
```bash
# Get latest articles
curl "http://localhost:3005/api/v1/partners/articles" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Sequential processing (recommended)
curl "http://localhost:3005/api/v1/partners/articles?sequenceId=12345&limit=500" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Load Balancing (Multiple Clients)
```bash
# Client 1 of 3
curl "http://localhost:3005/api/v1/partners/articles?numberOfSlices=3&sliceIndex=0" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Client 2 of 3  
curl "http://localhost:3005/api/v1/partners/articles?numberOfSlices=3&sliceIndex=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Format Options
```bash
# JSON format with compression
curl "http://localhost:3005/api/v1/partners/articles?format=json&compact=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Source Monitoring
```bash
# Check daily source changes
curl "http://localhost:3005/api/v1/partners/sources/changes?date=2025-06-04" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Production Requirements ⚠️

#### **Critical Missing Features for Production:**

1. **Database Persistence**
   - No storage for `sequenceId` tracking between calls
   - No rate limiting history storage
   - No compliance click tracking
   - No revoked articles storage

2. **Scheduled Operations**
   - No continuous polling (should run every 20-60 seconds)
   - No daily revoked articles compliance checks
   - No automated source changes monitoring

3. **Error Recovery & Resilience**
   - No retry logic for failed API calls
   - No circuit breakers for API failures
   - No specific error code handling workflows
   - No failover mechanisms

4. **Monitoring & Alerting**
   - No compliance tracking dashboards
   - No rate limit violation alerts
   - No API health monitoring
   - No article volume monitoring

5. **Advanced Data Processing**
   - Limited XML field extraction (missing 80%+ of available fields)
   - No sentiment analysis processing
   - No entity extraction
   - No company/stock ticker extraction
   - No media (images/videos) processing
   - No duplicate detection handling

#### **Next Steps for Production:**

1. **Database Schema Design**
   ```sql
   -- Example tables needed
   CREATE TABLE metabase_sequences (api_key VARCHAR, last_sequence_id BIGINT);
   CREATE TABLE rate_limit_history (api_key VARCHAR, last_call TIMESTAMP);
   CREATE TABLE compliance_clicks (article_id VARCHAR, clicked_at TIMESTAMP);
   CREATE TABLE revoked_articles (article_id VARCHAR, revoked_at TIMESTAMP);
   ```

2. **Background Job System**
   - Implement job scheduler (e.g., node-cron, Bull queue)
   - Set up continuous polling with 20-60 second intervals
   - Add daily compliance job for revoked articles

3. **Enhanced Data Models**
   - Expand Article interface to capture all available XML fields
   - Add sentiment, entity, and company extraction
   - Implement media processing for images/videos

4. **Monitoring Infrastructure**
   - Set up APM (e.g., New Relic, DataDog)
   - Create compliance dashboards
   - Add health check endpoints
   - Implement alert systems

### Technical Specifications

#### Rate Limiting
- **Minimum**: 20 seconds between calls
- **High Volume**: 30+ seconds recommended
- **Maximum**: 500 articles per call
- **Monitoring**: Can call every 60 minutes

#### Data Processing
- **Formats**: XML (default), JSON, RSS, Atom
- **Compression**: gzip + compact parameter
- **Size**: ~0.7MB compressed (5MB uncompressed) for 500 articles
- **Daily Volume**: ~4GB compressed (30GB uncompressed)

#### Authentication
- **Main API**: Metabase API key
- **Source Changes**: LexisNexis portal username/password
- **Development**: JWT tokens for local testing

### Compliance Notes

1. **Daily Revoked Articles**: Must call `/revoked-articles` daily for compliance
2. **Article Clicking**: Must click article URLs for royalty payments when content is displayed
3. **License Tracking**: Monitor `licenses[]` field for compliance requirements
4. **Rate Limiting**: Strictly enforce 20-second minimum between calls

### Testing

```bash
# Dev login for testing
curl -X POST "http://localhost:3005/api/v1/partners/dev-login" \
  -H "Content-Type: application/json" \
  -d '{"username": "dev", "password": "dev"}'

# Check rate limiting
curl "http://localhost:3005/api/v1/partners/rate-limit/check" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

See `/api-docs` for complete API documentation.

### Running with Docker Compose 