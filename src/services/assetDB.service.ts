import { db } from "../db";
import { assets } from "../db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { Asset } from "../types/asset";
import logger from "../utils/logger";

export class AssetDBService {
  // Create a new asset
  async createAsset(asset: Omit<Asset, "id" | "createdAt" | "updatedAt">): Promise<Asset> {
    logger.info(`Creating asset with name: ${asset.name}, type: ${asset.type} for thread: ${asset.threadId}`);
    
    const [newAsset] = await db
      .insert(assets)
      .values(asset)
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
    
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    const [updatedAsset] = await db
      .update(assets)
      .set(updateData)
      .where(eq(assets.id, id))
      .returning();
    
    if (!updatedAsset) {
      logger.error(`Failed to update asset ${id}. Asset not found or update failed.`);
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
} 