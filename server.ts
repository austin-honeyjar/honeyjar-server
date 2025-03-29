import express, { Express } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatHandler } from './src/api/chat';

dotenv.config();

const app: Express = express();

// Environment variables type checking
interface LangflowConfig {
  REACT_APP_LANGFLOW_ID: string;
  REACT_APP_FLOW_ID: string;
  REACT_APP_APPLICATION_TOKEN: string;
}

const {
  REACT_APP_LANGFLOW_ID,
  REACT_APP_FLOW_ID,
  REACT_APP_APPLICATION_TOKEN
} = process.env as Partial<LangflowConfig>;

if (!REACT_APP_LANGFLOW_ID || !REACT_APP_FLOW_ID || !REACT_APP_APPLICATION_TOKEN) {
  console.error('Missing required Langflow environment variables:', {
    hasLangflowId: !!REACT_APP_LANGFLOW_ID,
    hasFlowId: !!REACT_APP_FLOW_ID,
    hasToken: !!REACT_APP_APPLICATION_TOKEN
  });
}

// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOptions: cors.CorsOptions = {
  origin: isDevelopment ? ['http://localhost:3000', 'http://localhost:3004'] : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: isDevelopment
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add the chat endpoint
app.post('/api/chat', chatHandler as any);

const PORT = process.env.PORT || (isDevelopment ? 3005 : 3000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', {
    nodeEnv: process.env.NODE_ENV,
    hasLangflowId: !!REACT_APP_LANGFLOW_ID,
    hasFlowId: !!REACT_APP_FLOW_ID,
    hasToken: !!REACT_APP_APPLICATION_TOKEN
  });
}); 