import express from 'express';
import multer from 'multer';
import { getAllTables, createTable, deleteTable } from '../controllers/csvController.js';
import { validateRequest, validateFile } from '../services/validation.js';
import { csvUploadSchema, tableNameSchema } from '../services/validation.js';
import { logger } from '../services/logger.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, 'Incoming request');
  next();
});

// Get all tables
router.get('/', getAllTables);

// Create a new table from CSV
router.post('/upload', 
  upload.single('file'),
  validateFile(csvUploadSchema),
  createTable
);

// Delete a table
router.delete('/:tableName', 
  validateRequest(tableNameSchema),
  deleteTable
);

export default router; 