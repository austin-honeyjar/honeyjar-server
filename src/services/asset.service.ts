import { AssetDBService } from "./assetDB.service";
import { Asset, AssetCreationParams } from "../types/asset";
import logger from "../utils/logger";

export class AssetService {
  private assetDBService: AssetDBService;

  constructor() {
    this.assetDBService = new AssetDBService();
  }

  /**
   * Create a new asset from workflow data
   */
  async createAsset(params: AssetCreationParams): Promise<Asset> {
    logger.info(`Creating ${params.type} asset for thread ${params.threadId}`);
    
    try {
      // Create the asset in the database
      const asset = await this.assetDBService.createAsset({
        threadId: params.threadId,
        workflowId: params.workflowId,
        name: params.name,
        type: params.type,
        title: params.title,
        subtitle: params.subtitle,
        content: params.content,
        author: params.author,
        metadata: params.metadata || {}
      });
      
      logger.info(`Asset ${asset.id} created successfully`);
      return asset;
    } catch (error) {
      logger.error(`Error creating asset: ${error}`);
      throw new Error(`Failed to create asset: ${error}`);
    }
  }

  /**
   * Generate an asset based on workflow step data
   * Used specifically by the workflow service for asset_creation step type
   */
  async generateAssetFromStep(
    workflowId: string,
    threadId: string,
    stepData: any,
    userId: string
  ): Promise<Asset> {
    logger.info(`Generating asset from workflow step for thread ${threadId}`);
    
    // Extract asset details from step data
    const {
      assetName,
      assetType,
      assetTitle,
      assetSubtitle,
      assetContent,
      assetMetadata
    } = this.extractAssetDataFromStep(stepData);
    
    // Create the asset
    const asset = await this.createAsset({
      threadId,
      workflowId,
      name: assetName,
      type: assetType,
      title: assetTitle,
      subtitle: assetSubtitle,
      content: assetContent,
      author: userId,
      metadata: assetMetadata
    });
    
    return asset;
  }

  /**
   * Extract asset data from a workflow step
   * This handles different step formats to get the required asset data
   */
  private extractAssetDataFromStep(stepData: any): {
    assetName: string;
    assetType: string;
    assetTitle: string;
    assetSubtitle?: string;
    assetContent: string;
    assetMetadata?: any;
  } {
    const metadata = typeof stepData.metadata === 'string' 
      ? JSON.parse(stepData.metadata)
      : stepData.metadata || {};
    
    // For Asset Generation step, asset data could be in different places
    // Check different potential locations based on step structure
    
    // Extract asset content - prefer openAIResponse, fall back to userInput or other fields
    let assetContent = '';
    if (stepData.openAIResponse) {
      assetContent = stepData.openAIResponse;
    } else if (metadata.generatedContent) {
      assetContent = metadata.generatedContent;
    } else if (stepData.userInput && stepData.name.toLowerCase().includes('asset')) {
      assetContent = stepData.userInput;
    } else if (stepData.aiSuggestion) {
      assetContent = stepData.aiSuggestion;
    }
    
    // Extract asset type 
    const assetType = metadata.assetType || 
                     (stepData.name.includes('Press Release') ? 'Press Release' :
                      stepData.name.includes('Media Pitch') ? 'Media Pitch' :
                      stepData.name.includes('Social Post') ? 'Social Post' :
                      'Document');
    
    // Extract asset title - first try metadata, then step name or a default title
    const assetTitle = metadata.assetTitle || 
                      stepData.name.replace('Generation', '').trim() ||
                      `${assetType} - ${new Date().toLocaleDateString()}`;
    
    // Extract subtitle if available
    const assetSubtitle = metadata.assetSubtitle || undefined;
    
    // Use step name as asset name if not specified in metadata
    const assetName = metadata.assetName || stepData.name;
    
    // Return structured asset data
    return {
      assetName,
      assetType,
      assetTitle,
      assetSubtitle,
      assetContent,
      assetMetadata: metadata
    };
  }
  
  /**
   * Get all assets for a user
   */
  async getUserAssets(userId: string, orgId: string): Promise<Asset[]> {
    logger.info(`Getting all assets for user ${userId} in organization ${orgId}`);
    return this.assetDBService.getAllAssets(userId, orgId);
  }
  
  /**
   * Get all assets for a user without requiring organization ID
   */
  async getUserAssetsByUserId(userId: string): Promise<Asset[]> {
    logger.info(`Getting all assets for user ${userId} without organization filter`);
    return this.assetDBService.getAssetsByUserId(userId);
  }
  
  /**
   * Get all assets for an organization
   */
  async getOrganizationAssets(orgId: string): Promise<Asset[]> {
    logger.info(`Getting all assets for organization ${orgId}`);
    return this.assetDBService.getAssetsByOrganization(orgId);
  }
  
  /**
   * Get all assets for a thread
   */
  async getThreadAssets(threadId: string): Promise<Asset[]> {
    return this.assetDBService.getAssetsByThread(threadId);
  }
  
  /**
   * Get all assets for a workflow
   */
  async getWorkflowAssets(workflowId: string): Promise<Asset[]> {
    return this.assetDBService.getAssetsByWorkflow(workflowId);
  }
  
  /**
   * Get a specific asset by ID
   */
  async getAsset(id: string): Promise<Asset | null> {
    return this.assetDBService.getAsset(id);
  }
  
  /**
   * Update an existing asset
   */
  async updateAsset(
    id: string, 
    data: Partial<Omit<Asset, 'id' | 'threadId' | 'workflowId' | 'createdAt'>>
  ): Promise<Asset> {
    return this.assetDBService.updateAsset(id, data);
  }

  /**
   * Delete an asset
   */
  async deleteAsset(id: string): Promise<void> {
    return this.assetDBService.deleteAsset(id);
  }
} 