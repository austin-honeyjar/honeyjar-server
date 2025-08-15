import { db } from "../db";
import { assets } from "../db/schema";
import { eq, asc, desc, and } from "drizzle-orm";
import { Asset } from "../types/asset";
import logger from "../utils/logger";

export class AssetDBService {
  // Create a new asset
  async createAsset(asset: Omit<Asset, "id" | "createdAt" | "updatedAt">): Promise<Asset> {
    logger.info(`Creating asset with name: ${asset.name}, type: ${asset.type} for thread: ${asset.threadId}`);
    
    const [newAsset] = await db
      .insert(assets)
      .values({
        ...asset,
        content: typeof asset.content === 'string' ? asset.content : JSON.stringify(asset.content)
      })
      .returning();
    
    if (!newAsset) {
      logger.error(`Failed to create asset for thread ${asset.threadId}`);
      throw new Error(`Failed to create asset for thread ${asset.threadId}`);
    }
    
    logger.info(`Asset created successfully with ID: ${newAsset.id}`);
    return newAsset as Asset;
  }
  
  // Get asset by ID
  async getAsset(id: string): Promise<Asset | null> {
    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id)
    });
    
    return asset as Asset || null;
  }
  
  // Get all assets for a thread
  async getAssetsByThread(threadId: string): Promise<Asset[]> {
    logger.info(`Getting assets for thread ID: ${threadId}`);
    
    const threadAssets = await db.query.assets.findMany({
      where: eq(assets.threadId, threadId),
      orderBy: [desc(assets.createdAt)]
    });
    
    logger.info(`Found ${threadAssets.length} assets for thread ${threadId}`);
    return threadAssets as Asset[];
  }
  
  // Get all assets for a workflow
  async getAssetsByWorkflow(workflowId: string): Promise<Asset[]> {
    logger.info(`Getting assets for workflow ID: ${workflowId}`);
    
    const workflowAssets = await db.query.assets.findMany({
      where: eq(assets.workflowId, workflowId),
      orderBy: [asc(assets.createdAt)]
    });
    
    logger.info(`Found ${workflowAssets.length} assets for workflow ${workflowId}`);
    return workflowAssets as Asset[];
  }
  
  // Update an asset
  async updateAsset(
    id: string,
    data: Partial<Omit<Asset, "id" | "threadId" | "workflowId" | "createdAt">>
  ): Promise<Asset> {
    logger.info(`Updating asset ${id}`);
    
    // First, get the current state of the asset
    const currentAsset = await this.getAsset(id);
    if (!currentAsset) {
      logger.error(`Failed to update asset ${id}. Asset not found.`);
      throw new Error(`Asset ${id} not found`);
    }
    
    // If content is being updated, store the previous version in metadata
    const updateData: any = {
      ...data,
      updatedAt: new Date()
    };
    
    if (data.content && data.content !== currentAsset.content) {
      // Initialize metadata object if it doesn't exist
      if (!updateData.metadata) {
        updateData.metadata = currentAsset.metadata || {};
      }
      
      // Create or update the editHistory array
      if (!updateData.metadata.editHistory) {
        updateData.metadata.editHistory = [];
      }
      
      // Store the previous state including timestamp
      updateData.metadata.previousState = {
        content: currentAsset.content,
        timestamp: new Date().toISOString(),
        version: updateData.metadata.currentVersion || 1
      };
      
      // Increment version number
      updateData.metadata.currentVersion = 
        (currentAsset.metadata?.currentVersion || 1) + 1;
    }
    
    const [updatedAsset] = await db
      .update(assets)
      .set(updateData)
      .where(eq(assets.id, id))
      .returning();
    
    if (!updatedAsset) {
      logger.error(`Failed to update asset ${id}. Update operation failed.`);
      throw new Error(`Failed to update asset ${id}`);
    }
    
    logger.info(`Asset ${id} updated successfully`);
    return updatedAsset as Asset;
  }
  
  // Delete an asset
  async deleteAsset(id: string): Promise<void> {
    logger.warn(`Deleting asset ${id}`);
    
    await db
      .delete(assets)
      .where(eq(assets.id, id));
    
    logger.warn(`Deleted asset ${id}`);
  }
  
  // Get all assets for a user in a specific organization
  async getAllAssets(userId: string, orgId: string): Promise<Asset[]> {
    try {
      logger.info(`Getting all assets for user ${userId} in organization ${orgId}`);
      
      const userAssets = await db.query.assets.findMany({
        where: and(
          eq(assets.author, userId),
          eq(assets.orgId, orgId)
        ),
        orderBy: [desc(assets.createdAt)]
      });
      
      logger.info(`Found ${userAssets.length} assets for user ${userId} in organization ${orgId}`);
      return userAssets as Asset[];
    } catch (error) {
      logger.error(`Error getting assets for user ${userId} in org ${orgId}:`, error);
      throw new Error(`Failed to get assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Get all assets for a user by userId without organization
  async getAssetsByUserId(userId: string): Promise<Asset[]> {
    try {
      logger.info(`Getting all assets for user ${userId} without organization filter`);
      
      const userAssets = await db.query.assets.findMany({
        where: eq(assets.author, userId),
        orderBy: [desc(assets.createdAt)]
      });
      
      logger.info(`Found ${userAssets.length} assets for user ${userId}`);
      return userAssets as Asset[];
    } catch (error) {
      logger.error(`Error getting assets for user ${userId}:`, error);
      throw new Error(`Failed to get assets for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Get all assets for an organization
  async getAssetsByOrganization(orgId: string): Promise<Asset[]> {
    logger.info(`Getting all assets for organization ID: ${orgId}`);
    
    const orgAssets = await db.query.assets.findMany({
      where: eq(assets.orgId, orgId),
      orderBy: [desc(assets.createdAt)]
    });
    
    logger.info(`Found ${orgAssets.length} assets for organization ${orgId}`);
    return orgAssets as Asset[];
  }
  
  // Undo the last edit to an asset
  async undoLastEdit(id: string): Promise<Asset> {
    logger.info(`Undoing last edit for asset ${id}`);
    
    // Get current asset state
    const asset = await this.getAsset(id);
    if (!asset) {
      logger.error(`Cannot undo edit: Asset ${id} not found`);
      throw new Error(`Asset ${id} not found`);
    }
    
    // Check if there's a previous state to restore
    if (!asset.metadata?.previousState?.content) {
      logger.warn(`No previous state found for asset ${id}`);
      throw new Error(`No previous edit state found for asset ${id}`);
    }
    
    // Get the previous content
    const previousContent = asset.metadata.previousState.content;
    const previousVersion = asset.metadata.previousState.version;
    
    // Initialize update data
    const updateData: any = {
      content: previousContent,
      updatedAt: new Date(),
      metadata: {
        ...asset.metadata,
        currentVersion: previousVersion,
        undoPerformed: true,
        undoTimestamp: new Date().toISOString()
      }
    };
    
    // Remove the previous state we're restoring from
    delete updateData.metadata.previousState;
    
    // Add undo record to edit history
    if (!updateData.metadata.editHistory) {
      updateData.metadata.editHistory = [];
    }
    
    updateData.metadata.editHistory.push({
      type: 'undo',
      timestamp: new Date().toISOString(),
      fromVersion: asset.metadata.currentVersion || 1,
      toVersion: previousVersion
    });
    
    // Perform the update
    const [updatedAsset] = await db
      .update(assets)
      .set(updateData)
      .where(eq(assets.id, id))
      .returning();
    
    if (!updatedAsset) {
      logger.error(`Failed to undo edit for asset ${id}`);
      throw new Error(`Failed to undo edit for asset ${id}`);
    }
    
    logger.info(`Successfully undid last edit for asset ${id}`);
    return updatedAsset as Asset;
  }
} 