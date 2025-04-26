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
  content: string;
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
  content: string;
  author: string;
  metadata?: any;
} 