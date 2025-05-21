import { AssetDBService } from "./assetDB.service";
import { Asset, AssetCreationParams } from "../types/asset";
import logger from "../utils/logger";
import { OpenAIService } from "./openai.service";

// Cache for recent asset edits to improve performance
const assetEditCache = new Map<string, {
  content: string;
  lastEdited: Date;
  version: number;
}>();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

export class AssetService {
  private assetDBService: AssetDBService;
  private openAIService: OpenAIService;

  constructor() {
    this.assetDBService = new AssetDBService();
    this.openAIService = new OpenAIService();
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
    
    // Extract asset content - prefer metadata.generatedAsset first
    let assetContent = '';
    
    // First check for generatedAsset in metadata (highest priority)
    if (metadata.generatedAsset) {
      assetContent = metadata.generatedAsset;
      logger.info('Using generatedAsset from metadata as content source');
    }
    // Next try openAIResponse, but parse it to extract just the asset
    else if (stepData.openAIResponse) {
      try {
        // Try to parse response as JSON to extract just asset content
        const parsedResponse = JSON.parse(stepData.openAIResponse);
        if (parsedResponse.asset) {
          assetContent = parsedResponse.asset;
          logger.info('Successfully extracted asset from openAIResponse JSON');
        } else {
          assetContent = stepData.openAIResponse;
          logger.info('Using complete openAIResponse as content (no asset field found in JSON)');
        }
      } catch (e) {
        // If parsing fails, use the whole response
        assetContent = stepData.openAIResponse;
        logger.info('Using complete openAIResponse as content (not valid JSON)');
      }
    } 
    // Fall back to other possible content sources
    else if (metadata.generatedContent) {
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
    
    logger.info(`Extracted asset data: ${assetName} (${assetType}), content length: ${assetContent?.length || 0}`);
    
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

  /**
   * Edit asset text with AI assistance
   * Supports multiple sequential edits to the same asset
   */
  async editAssetText(
    assetId: string, 
    params: { 
      selectedText: string; 
      instruction: string;
      userId: string; 
    }
  ): Promise<Asset> {
    const { selectedText, instruction, userId } = params;
    
    logger.info(`Processing text edit for asset ${assetId}`, {
      selectedTextLength: selectedText.length,
      instructionLength: instruction.length
    });

    try {
      // Get latest asset data (from cache if available, otherwise from DB)
      let asset = await this.getAssetWithCache(assetId);
      if (!asset) {
        throw new Error(`Asset not found: ${assetId}`);
      }

      // Initialize edit history in metadata if it doesn't exist
      if (!asset.metadata) {
        asset.metadata = {};
      }
      
      if (!asset.metadata.editHistory) {
        asset.metadata.editHistory = [];
      }

      // Get current version number
      const currentVersion = asset.metadata.currentVersion || 1;

      // Process the edit with AI
      const updatedText = await this.processTextEdit(
        asset.content,
        selectedText,
        instruction
      );

      // If no changes were made, return the original asset
      if (updatedText === asset.content) {
        logger.info(`No changes made to asset ${assetId} content`);
        return asset;
      }

      // Store the edit in edit history
      asset.metadata.editHistory.push({
        timestamp: new Date().toISOString(),
        selectedText,
        instruction,
        userId,
        version: currentVersion + 1
      });

      // Update the asset with new content and version
      const updatedAsset = await this.assetDBService.updateAsset(assetId, {
        content: updatedText,
        metadata: {
          ...asset.metadata,
          currentVersion: currentVersion + 1,
          lastEditedBy: userId,
          lastEditedAt: new Date().toISOString()
        }
      });

      // Update the cache
      this.updateAssetCache(assetId, updatedAsset);

      logger.info(`Asset ${assetId} text updated successfully`, {
        newVersion: currentVersion + 1,
        editHistoryLength: asset.metadata.editHistory.length
      });

      return updatedAsset;
    } catch (error) {
      logger.error(`Error editing asset text: ${error}`);
      throw new Error(`Failed to edit asset text: ${error}`);
    }
  }

  /**
   * Process text edit using AI to generate updated content
   */
  private async processTextEdit(
    fullContent: string,
    selectedText: string,
    instruction: string
  ): Promise<string> {
    try {
      // Use OpenAI to generate edited text based on the instruction
      const response = await this.openAIService.generateEditedText(selectedText, instruction);
      
      // If OpenAI didn't return anything useful, return the original content
      if (!response || response.trim() === '') {
        logger.warn('OpenAI returned empty response for text edit');
        return fullContent;
      }

      // Replace the selected text in the full content
      // Using a more robust replacement that handles multiple occurrences and special characters
      return this.replaceTextInContent(fullContent, selectedText, response);
    } catch (error) {
      logger.error(`Error processing text edit with AI: ${error}`);
      throw new Error(`AI processing error: ${error}`);
    }
  }

  /**
   * Replace text in content with better handling of multiple occurrences
   */
  private replaceTextInContent(
    fullContent: string, 
    selectedText: string, 
    replacementText: string
  ): string {
    // If the selected text doesn't exist in the content, return original
    if (!fullContent.includes(selectedText)) {
      logger.warn('Selected text not found in content - unable to replace');
      return fullContent;
    }

    // Simple replacement for now - could be enhanced with fuzzy matching
    // or better context awareness for multiple occurrences
    return fullContent.replace(selectedText, replacementText);
  }

  /**
   * Get asset with caching for better performance during sequential edits
   */
  private async getAssetWithCache(assetId: string): Promise<Asset | null> {
    // Check if we have a valid cache entry
    const cachedAsset = assetEditCache.get(assetId);
    const now = new Date();
    
    if (cachedAsset && 
        (now.getTime() - cachedAsset.lastEdited.getTime() < CACHE_EXPIRATION_MS)) {
      logger.info(`Using cached asset data for ${assetId}`);
      
      // Get fresh copy from DB but use cached content if it's more recent
      const dbAsset = await this.assetDBService.getAsset(assetId);
      if (!dbAsset) return null;
      
      // If cache version is newer, use cached content
      if (cachedAsset.version > (dbAsset.metadata?.currentVersion || 1)) {
        dbAsset.content = cachedAsset.content;
      }
      
      return dbAsset;
    }
    
    // No valid cache entry, get from database
    return this.assetDBService.getAsset(assetId);
  }
  
  /**
   * Update asset cache with new content
   */
  private updateAssetCache(assetId: string, asset: Asset): void {
    assetEditCache.set(assetId, {
      content: asset.content,
      lastEdited: new Date(),
      version: asset.metadata?.currentVersion || 1
    });
    
    // Clean up expired cache entries occasionally
    if (Math.random() < 0.1) { // 10% chance on each update
      this.cleanupAssetCache();
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupAssetCache(): void {
    const now = new Date().getTime();
    
    for (const [assetId, cacheEntry] of assetEditCache.entries()) {
      if (now - cacheEntry.lastEdited.getTime() > CACHE_EXPIRATION_MS) {
        assetEditCache.delete(assetId);
      }
    }
  }
  
  /**
   * Undo the last edit to an asset
   * Restores the previous content state
   */
  async undoLastEdit(assetId: string, userId: string): Promise<Asset> {
    logger.info(`Undoing last edit for asset ${assetId}`);
    
    try {
      // Get latest asset data
      const asset = await this.getAssetWithCache(assetId);
      if (!asset) {
        throw new Error(`Asset not found: ${assetId}`);
      }
      
      // Use the AssetDBService's undoLastEdit method to perform the undo operation
      const restoredAsset = await this.assetDBService.undoLastEdit(assetId);
      
      // Update the cache with the restored content
      this.updateAssetCache(assetId, restoredAsset);
      
      logger.info(`Successfully undid last edit for asset ${assetId}`, {
        restoredVersion: restoredAsset.metadata?.currentVersion || 1
      });
      
      return restoredAsset;
    } catch (error) {
      logger.error(`Error undoing asset edit: ${error}`);
      throw new Error(`Failed to undo edit: ${error}`);
    }
  }
} 