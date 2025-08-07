import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { z } from 'zod';
import { ragService } from '../services/ragService';
import logger from '../utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(authMiddleware);

// Onboarding schema
const onboardingSchema = z.object({
  workplace: z.string().min(1, 'Company name is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  industry: z.array(z.string()).min(1, 'At least one industry is required'),
});

/**
 * @swagger
 * /api/v1/user/onboarding:
 *   post:
 *     tags: [User]
 *     summary: Complete user onboarding
 *     description: Store user onboarding data in the knowledge base for RAG system integration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workplace
 *               - jobTitle
 *               - industry
 *             properties:
 *               workplace:
 *                 type: string
 *                 description: Company name
 *                 example: 'Acme Corp'
 *               jobTitle:
 *                 type: string
 *                 description: User's job title
 *                 example: 'Marketing Manager'
 *               industry:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Industries the company operates in
 *                 example: ['Technology', 'Healthcare']
 *     responses:
 *       200:
 *         description: Onboarding completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Onboarding completed successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/onboarding', validateRequest(onboardingSchema), async (req, res) => {
  try {
    const { workplace, jobTitle, industry } = req.body;
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User ID not found in request'
      });
    }

    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    // Store onboarding data in the RAG knowledge base
    const userKnowledge = {
      userId,
      orgId,
      companyName: workplace,
      jobTitle,
      industry: Array.isArray(industry) ? industry.join(', ') : industry,
      // Set some smart defaults for new users
      preferredTone: 'professional',
      preferredWorkflows: [],
      defaultPlatforms: [],
      writingStylePreferences: {}
    };

    await ragService.storeUserKnowledge(userKnowledge);

    // Log onboarding completion for analytics
    logger.info(`User onboarding completed`, {
      userId,
      orgId,
      workplace,
      jobTitle,
      industryCount: Array.isArray(industry) ? industry.length : 1
    });

    res.json({
      status: 'success',
      message: 'Onboarding completed successfully',
      data: {
        userId,
        orgId,
        companyName: workplace,
        jobTitle,
        industry: userKnowledge.industry
      }
    });

  } catch (error) {
    logger.error('Error completing onboarding:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete onboarding'
    });
  }
});

/**
 * @swagger
 * /api/v1/user/profile:
 *   get:
 *     tags: [User]
 *     summary: Get user profile and knowledge base
 *     description: Retrieve user's stored knowledge base data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     orgId:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                     jobTitle:
 *                       type: string
 *                     industry:
 *                       type: string
 *                     preferredTone:
 *                       type: string
 *                     preferredWorkflows:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User profile not found
 *       500:
 *         description: Server error
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User ID not found in request'
      });
    }

    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    const userKnowledge = await ragService.getUserKnowledge(userId, orgId);

    if (!userKnowledge) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found'
      });
    }

    res.json({
      status: 'success',
      data: userKnowledge
    });

  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user profile'
    });
  }
});

/**
 * @swagger
 * /api/v1/user/profile:
 *   put:
 *     tags: [User]
 *     summary: Update user profile
 *     description: Update user's knowledge base data
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               jobTitle:
 *                 type: string
 *               industry:
 *                 type: string
 *               companyDescription:
 *                 type: string
 *               companySize:
 *                 type: string
 *               headquarters:
 *                 type: string
 *               preferredTone:
 *                 type: string
 *               preferredWorkflows:
 *                 type: array
 *                 items:
 *                   type: string
 *               defaultPlatforms:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User ID not found in request'
      });
    }

    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    // Get existing knowledge base
    const existingKnowledge = await ragService.getUserKnowledge(userId, orgId);

    // Update with new data
    const updatedKnowledge = {
      ...existingKnowledge,
      ...req.body,
      userId,
      orgId
    };

    await ragService.storeUserKnowledge(updatedKnowledge);

    logger.info(`User profile updated`, { userId, orgId });

    res.json({
      status: 'success',
      message: 'Profile updated successfully',
      data: updatedKnowledge
    });

  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
});

export default router; 