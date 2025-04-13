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