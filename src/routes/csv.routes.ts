import { Router } from 'express';
import { getAllTables, createTable, deleteTable } from '../controllers/csvController';
import { validateRequest } from '../middleware/validation.middleware';
import { createTableSchema, deleteTableSchema } from '../validators/csv.validator';
import { requirePermission } from '../middleware/permissions.middleware';
import logger from '../utils/logger';
import { requireOrgRole } from '../middleware/org.middleware';
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
 * /api/v1/csv/tables:
 *   get:
 *     tags: [CSV]
 *     summary: Get all CSV tables
 *     description: Returns a list of all CSV tables with their data. Requires admin panel access.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CSVTable'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/tables', 
  requirePermission('admin_panel'),
  requireOrgRole(['admin']),
  getAllTables
);

/**
 * @swagger
 * /api/v1/csv/tables:
 *   post:
 *     tags: [CSV]
 *     summary: Create a new CSV table
 *     description: Creates a new table from CSV data. Requires admin panel access.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - columns
 *               - data
 *               - fileName
 *             properties:
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Column names
 *                 example: ['id', 'name', 'age', 'email']
 *               data:
 *                 type: array
 *                 items:
 *                   type: array
 *                   items:
 *                     type: string
 *                 description: Table data rows where each inner array represents a row of data
 *                 example: [
 *                   ['1', 'John Doe', '30', 'john@example.com'],
 *                   ['2', 'Jane Smith', '25', 'jane@example.com'],
 *                   ['3', 'Bob Johnson', '35', 'bob@example.com']
 *                 ]
 *               fileName:
 *                 type: string
 *                 description: Name of the CSV file
 *                 example: 'users.csv'
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
 *                   example: 'csv_users_1234567890'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/tables', 
  requirePermission('admin_panel'),
  requireOrgRole(['admin']),
  validateRequest(createTableSchema),
  createTable
);

/**
 * @swagger
 * /api/v1/csv/tables:
 *   delete:
 *     tags: [CSV]
 *     summary: Delete a CSV table
 *     description: Deletes a CSV table and its metadata. Requires admin panel access.
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/tables', 
  requirePermission('admin_panel'),
  requireOrgRole(['admin']),
  validateRequest(deleteTableSchema),
  deleteTable
);

export default router; 