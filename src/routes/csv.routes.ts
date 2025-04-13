import { Router } from 'express';
import { getAllTables, createTable, deleteTable } from '../controllers/csvController';
import { validate } from '../middleware/validation.middleware';
import { createTableSchema, deleteTableSchema } from '../validators/csv.validator';
import logger from '../utils/logger';

const router = Router();

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

/**
 * @swagger
 * /api/csv/tables:
 *   get:
 *     tags: [CSV]
 *     summary: Get all CSV tables
 *     description: Returns a list of all CSV tables with their data
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CSVTable'
 */
router.get('/tables', getAllTables);

/**
 * @swagger
 * /api/csv/tables:
 *   post:
 *     tags: [CSV]
 *     summary: Create a new CSV table
 *     description: Creates a new table from CSV data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *                 description: Name of the CSV file
 *               data:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: CSV data as JSON array
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Table created successfully
 *                 tableName:
 *                   type: string
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/tables', 
  validate(createTableSchema),
  createTable
);

/**
 * @swagger
 * /api/csv/tables:
 *   delete:
 *     tags: [CSV]
 *     summary: Delete a CSV table
 *     description: Deletes a CSV table and its metadata
 *     parameters:
 *       - in: query
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the table to delete
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Table deleted successfully
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/tables', 
  validate(deleteTableSchema),
  deleteTable
);

export default router; 