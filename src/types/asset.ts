/**
 * Core asset types for the asset storage system
 * Asset decorators are now in chat-message.ts
 */

/**
 * Represents an asset in the system
 */
export interface Asset {
  id: string;
  threadId: string;
  workflowId?: string;
  name: string;
  type: string;
  title: string;
  subtitle?: string;
  content: string; // Simplified to just string content
  author: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for creating a new asset
 */
export interface AssetCreationParams {
  threadId: string;
  workflowId?: string;
  name: string;
  type: string;
  title: string;
  subtitle?: string;
  content: string; // Simplified to just string content
  author: string;
  metadata?: any;
}
