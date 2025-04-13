import { Router } from 'express';
import { getAllTables, createTable, deleteTable } from '../controllers/csvController';

const router = Router();

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
 *             $ref: '#/components/schemas/CreateTableRequest'
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
router.post('/tables', createTable);

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
router.delete('/tables', deleteTable);

export default router; 