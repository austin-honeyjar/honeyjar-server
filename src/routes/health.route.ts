import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import { config } from '../config';

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Health check endpoint
router.get('/', (req, res) => {
  const data = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  
  res.status(200).json(data);
});

// Database health check
router.get('/database', async (req, res) => {
  try {
    // Simple query to test database connection
    const result = await pool.query('SELECT 1 AS result');
    
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Database health check failed', { error });
    
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message || 'Unknown database error'
    });
  }
});

// Ready check endpoint for Cloud Run
router.get('/ready', (_req, res) => {
  return res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Add a test endpoint to debug auth issues
router.get('/auth-test', async (req, res) => {
  console.log('Auth test endpoint called');
  console.log('Headers:', JSON.stringify(req.headers));
  
  return res.status(200).json({
    status: 'ok',
    message: 'Auth test endpoint working',
    headers: {
      authorization: req.headers.authorization ? 'Present (first 10 chars): ' + req.headers.authorization.substring(0, 10) + '...' : 'Not present',
      origin: req.headers.origin || 'None',
      'user-agent': req.headers['user-agent'] || 'None'
    },
    timestamp: new Date().toISOString()
  });
});

export default router; 