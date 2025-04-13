import { Router } from 'express';
import { getAllTables, createTable, deleteTable } from '../controllers/csvController.js';

const router = Router();

// Get all CSV tables
router.get('/tables', getAllTables);

// Create a new CSV table
router.post('/tables', createTable);

// Delete a CSV table
router.delete('/tables', deleteTable);

export default router; 