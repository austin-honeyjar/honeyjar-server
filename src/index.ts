import express, { Express } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chatRoutes.js';
import { getAllTables, createTable } from './controllers/csvController.js';
import { ensureTables } from './db/index.js';

dotenv.config();

const app: Express = express();

// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOptions: cors.CorsOptions = {
  origin: isDevelopment ? ['http://localhost:3000', 'http://localhost:3004'] : '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: isDevelopment
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Routes
app.use('/api/chat', chatRouter);

// CSV endpoints
app.get('/api/csv', getAllTables);
app.post('/api/csv', createTable);

const PORT = process.env.PORT || (isDevelopment ? 3001 : 3000);

// Start server after ensuring database tables exist
ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Environment:', {
        nodeEnv: process.env.NODE_ENV,
        isDevelopment
      });
    });
  })
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  }); 