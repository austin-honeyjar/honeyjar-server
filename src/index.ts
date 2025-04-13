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
const isDevlocal = process.env.NODE_ENV === 'devlocal';
const corsOptions: cors.CorsOptions = {
  origin: isDevlocal ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'] : '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: isDevlocal
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Routes
//app.use('/api/chat', chatRouter);

// CSV endpoints
app.get('/api/csv', getAllTables);
app.post('/api/csv', createTable);

const PORT = process.env.PORT || (isDevlocal ? 3005 : 3000);

// Start server after ensuring database tables exist
ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Environment:', {
        nodeEnv: process.env.NODE_ENV,
        isDevlocal
      });
    });
  })
  .catch((error: Error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  }); 