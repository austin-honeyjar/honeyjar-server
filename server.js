const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Import route handlers
const chatHandler = require('./api/chat');

const app = express();

// Validate Langflow environment variables
const {
  REACT_APP_LANGFLOW_ID,
  REACT_APP_FLOW_ID,
  REACT_APP_APPLICATION_TOKEN
} = process.env;

if (!REACT_APP_LANGFLOW_ID || !REACT_APP_FLOW_ID || !REACT_APP_APPLICATION_TOKEN) {
  console.error('Missing required Langflow environment variables:', {
    hasLangflowId: !!REACT_APP_LANGFLOW_ID,
    hasFlowId: !!REACT_APP_FLOW_ID,
    hasToken: !!REACT_APP_APPLICATION_TOKEN
  });
}

// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOptions = {
  origin: isDevelopment ? ['http://localhost:3000', 'http://localhost:3004'] : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: isDevelopment
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keep your existing routes here
// ... existing honeyjar-server routes ...

// Add the chat endpoint
app.post('/api/chat', chatHandler);

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