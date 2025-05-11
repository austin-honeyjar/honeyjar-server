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
 * /api/v1/assets:
 *   get:
 *     summary: Get all assets for the current user
 *     description: Returns a list of all assets created by the currently authenticated user
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-organization-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Organization ID
 *     responses:
 *       200:
 *         description: List of assets for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/assets', assetController.getUserAssets);

/**
 * @swagger
 * /api/v1/organization/assets:
 *   get:
 *     summary: Get all assets for the organization
 *     description: Returns a list of all assets within the specified organization (requires admin role)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-organization-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of assets for the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request - Missing organization ID
 *       500:
 *         description: Server error
 */
router.get('/organization/assets', 
  requireOrgRole(['admin']), 
  assetController.getOrganizationAssets
);

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
 *       - in: header
 *         name: x-organization-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Organization ID
 *     responses:
 *       200:
 *         description: List of assets for the thread
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/threads/:threadId/assets', assetController.getThreadAssets);

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
router.get('/assets/:assetId', assetController.getAsset);

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
 *       - in: header
 *         name: x-organization-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Organization ID
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
router.post('/threads/:threadId/assets', assetController.createAsset);

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
 *       - in: header
 *         name: x-organization-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Organization ID
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
router.put('/assets/:assetId', assetController.updateAsset);

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
 *       - in: header
 *         name: x-organization-id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional Organization ID
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
router.delete('/assets/:assetId', assetController.deleteAsset);

/**
 * @swagger
 * /api/v1/assets/{assetId}/edit:
 *   post:
 *     summary: Edit text in an asset with AI assistance
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
 *             required:
 *               - selectedText
 *               - instruction
 *             properties:
 *               selectedText:
 *                 type: string
 *                 description: The text selection to be edited
 *               instruction:
 *                 type: string
 *                 description: Instructions for how to edit the selected text
 *     responses:
 *       200:
 *         description: Asset text edited successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 asset:
 *                   $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       500:
 *         description: Server error
 */
router.post('/assets/:assetId/edit', assetController.editAssetText);

/**
 * @swagger
 * /api/v1/assets/{assetId}/undo-edit:
 *   post:
 *     summary: Undo the last text edit in an asset
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
 *         description: Last edit undone successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 asset:
 *                   $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found or no edit to undo
 *       500:
 *         description: Server error
 */
router.post('/assets/:assetId/undo-edit', assetController.undoLastEdit);

export default router; 