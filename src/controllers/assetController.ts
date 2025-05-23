import { Request, Response } from 'express';
import { AssetService } from '../services/asset.service';
import { Asset, AssetCreationParams } from '../types/asset';
import logger from '../utils/logger';
import { AuthRequest } from '../types/request';

const assetService = new AssetService();

export const assetController = {
  // Get all assets for a user
  getUserAssets: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      // Organization ID is now optional - just use userId if no orgId
      // Get all assets for the user, with or without orgId
      const assets = orgId 
        ? await assetService.getUserAssets(userId, orgId)
        : await assetService.getUserAssetsByUserId(userId);

      logger.info('Retrieved user assets', { userId, assetCount: assets.length });
      res.json({ assets });
    } catch (error) {
      logger.error('Error getting user assets:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get user assets'
      });
    }
  },

  // Get all assets for an organization
  getOrganizationAssets: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Get all assets for the organization
      const assets = await assetService.getOrganizationAssets(orgId);

      logger.info('Retrieved organization assets', { orgId, assetCount: assets.length });
      res.json({ assets });
    } catch (error) {
      logger.error('Error getting organization assets:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get organization assets'
      });
    }
  },

  // Get all assets for a thread
  getThreadAssets: async (req: AuthRequest, res: Response) => {
    try {
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      // Organization ID is now optional - removed requirement

      // Get assets for the thread
      const assets = await assetService.getThreadAssets(threadId);

      logger.info('Retrieved thread assets', { threadId, assetCount: assets.length });
      res.json({ assets });
    } catch (error) {
      logger.error('Error getting thread assets:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get thread assets'
      });
    }
  },

  // Get a specific asset by ID
  getAsset: async (req: AuthRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      // Get the asset
      const asset = await assetService.getAsset(assetId);

      if (!asset) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Asset not found'
        });
      }

      logger.info('Retrieved asset', { assetId, assetType: asset.type });
      res.json({ asset });
    } catch (error) {
      logger.error('Error getting asset:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get asset'
      });
    }
  },

  // Create a new asset
  createAsset: async (req: AuthRequest, res: Response) => {
    try {
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;
      const { name, type, title, subtitle, content, workflowId, metadata } = req.body;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      // Organization ID is now optional - removed requirement

      // Validate required fields
      if (!name || !type || !title || !content) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Missing required fields: name, type, title, content'
        });
      }

      // Create the asset
      const asset = await assetService.createAsset({
        threadId,
        workflowId,
        name,
        type,
        title,
        subtitle,
        content,
        author: userId,
        metadata
      });

      logger.info('Created asset', { assetId: asset.id, threadId, assetType: asset.type });
      res.status(201).json({ asset });
    } catch (error) {
      logger.error('Error creating asset:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create asset'
      });
    }
  },

  // Update an asset
  updateAsset: async (req: AuthRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      const userId = req.user?.id;
      const { name, type, title, subtitle, content, metadata } = req.body;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      // Get the existing asset to verify it exists
      const existingAsset = await assetService.getAsset(assetId);

      if (!existingAsset) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Asset not found'
        });
      }

      // Update the asset
      const asset = await assetService.updateAsset(assetId, {
        name,
        type,
        title,
        subtitle,
        content,
        metadata
      });

      logger.info('Updated asset', { assetId, assetType: asset.type });
      res.json({ asset });
    } catch (error) {
      logger.error('Error updating asset:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update asset'
      });
    }
  },

  // Delete an asset
  deleteAsset: async (req: AuthRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }
      
      // Get the asset to check if it exists
      const asset = await assetService.getAsset(assetId);
      
      if (!asset) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Asset not found'
        });
      }
      
      // Delete the asset
      await assetService.deleteAsset(assetId);
      
      logger.info('Deleted asset', { assetId });
      res.json({ success: true, assetId });
    } catch (error) {
      logger.error('Error deleting asset:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete asset'
      });
    }
  },

  // Edit asset text with AI assistance
  editAssetText: async (req: AuthRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      const userId = req.user?.id;
      const { selectedText, instruction } = req.body;

      logger.info('Received edit request', { 
        assetId,
        userId,
        selectedTextLength: selectedText?.length,
        instructionLength: instruction?.length
      });

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!assetId) {
        logger.warn('Missing assetId in request params');
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Asset ID is required'
        });
      }

      if (!selectedText || !instruction) {
        logger.warn('Missing required fields', { 
          hasSelectedText: !!selectedText, 
          hasInstruction: !!instruction 
        });
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Selected text and instruction are required'
        });
      }

      // Get the existing asset to verify it exists
      const existingAsset = await assetService.getAsset(assetId);

      if (!existingAsset) {
        logger.warn(`Asset not found: ${assetId}`);
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Asset not found'
        });
      }

      // Process the edit request and get updated asset
      logger.info('Processing edit request', { assetId });
      const asset = await assetService.editAssetText(assetId, {
        selectedText,
        instruction,
        userId
      });

      logger.info('Updated asset text with AI assistance', { 
        assetId, 
        instructionLength: instruction.length,
        selectedTextLength: selectedText.length
      });
      
      res.json({ asset });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error editing asset text:', { error: errorMessage });
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: `Failed to edit asset text: ${errorMessage}`
      });
    }
  },
  
  // Undo the last text edit for an asset
  undoLastEdit: async (req: AuthRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      const userId = req.user?.id;

      logger.info('Received undo edit request', { 
        assetId,
        userId
      });

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!assetId) {
        logger.warn('Missing assetId in request params');
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Asset ID is required'
        });
      }

      // Get the existing asset to verify it exists
      const existingAsset = await assetService.getAsset(assetId);

      if (!existingAsset) {
        logger.warn(`Asset not found: ${assetId}`);
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Asset not found'
        });
      }

      // Process the undo request
      logger.info('Processing undo request', { assetId });
      const asset = await assetService.undoLastEdit(assetId, userId);

      logger.info('Undid last edit for asset', { 
        assetId,
        restoredVersion: asset.metadata?.currentVersion || 1
      });
      
      res.json({ asset });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error undoing asset edit:', { error: errorMessage });
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: `Failed to undo edit: ${errorMessage}`
      });
    }
  }
}; 