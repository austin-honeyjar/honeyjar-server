import express from 'express';
import { createTable, deleteTable, getAllTables } from '../controllers/csvController.js';

const router = express.Router();

// Get all CSV tables
router.get('/', getAllTables);

// Create a new table and insert CSV data
router.post('/', createTable);

// Delete a table and its metadata
router.delete('/', deleteTable);

export default router; 