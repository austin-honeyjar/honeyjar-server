import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import logger from '../utils/logger';
import { requireOrgRole } from '../middleware/org.middleware';
import { assetController } from '../controllers/assetController';

const router = Router();

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info('Incoming asset request', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Apply authentication middleware to all asset routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/threads/{threadId}/assets:
 *   get:
 *     summary: Get all assets for a thread
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     responses:
 *       200:
 *         description: List of assets for the thread
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/threads/:threadId/assets', 
  requireOrgRole(['admin', 'member']), 
  assetController.getThreadAssets
);

/**
 * @swagger
 * /api/v1/assets/{assetId}:
 *   get:
 *     summary: Get a specific asset by ID
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     responses:
 *       200:
 *         description: Asset details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       500:
 *         description: Server error
 */
router.get('/assets/:assetId', 
  requireOrgRole(['admin', 'member']), 
  assetController.getAsset
);

/**
 * @swagger
 * /api/v1/threads/{threadId}/assets:
 *   post:
 *     summary: Create a new asset
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - title
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the asset
 *               type:
 *                 type: string
 *                 description: Type of asset (e.g., "Press Release", "Media Pitch")
 *               title:
 *                 type: string
 *                 description: Title of the asset
 *               subtitle:
 *                 type: string
 *                 description: Subtitle of the asset (optional)
 *               content:
 *                 type: string
 *                 description: Content of the asset
 *               workflowId:
 *                 type: string
 *                 description: ID of the associated workflow (optional)
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the asset (optional)
 *     responses:
 *       201:
 *         description: Asset created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/threads/:threadId/assets', 
  requireOrgRole(['admin', 'member']), 
  assetController.createAsset
);

/**
 * @swagger
 * /api/v1/assets/{assetId}:
 *   put:
 *     summary: Update an existing asset
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the asset
 *               type:
 *                 type: string
 *                 description: Type of asset
 *               title:
 *                 type: string
 *                 description: Title of the asset
 *               subtitle:
 *                 type: string
 *                 description: Subtitle of the asset
 *               content:
 *                 type: string
 *                 description: Content of the asset
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the asset
 *     responses:
 *       200:
 *         description: Asset updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       500:
 *         description: Server error
 */
router.put('/assets/:assetId', 
  requireOrgRole(['admin', 'member']), 
  assetController.updateAsset
);

/**
 * @swagger
 * /api/v1/assets/{assetId}:
 *   delete:
 *     summary: Delete an asset
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     responses:
 *       200:
 *         description: Asset deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       500:
 *         description: Server error
 */
router.delete('/assets/:assetId', 
  requireOrgRole(['admin', 'member']), 
  assetController.deleteAsset
);

export default router; 