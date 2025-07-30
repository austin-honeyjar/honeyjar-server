/**
 * Asset content decorators - simplified to core types: text, list, contact
 */

// Base interface for asset content decorators (matches MessageDecorator)
export interface AssetContentDecorator {
  type: string;
  data?: Record<string, any>;
}

// Contact decorator - individual contact information
export interface ContactDecorator extends AssetContentDecorator {
  type: 'contact';
  data: {
    name: string;
    email: string;
    publication?: string;
    relevanceScore?: number;
  };
}

// List decorator - collection of text or contacts
export interface ListDecorator extends AssetContentDecorator {
  type: 'list';
  data: {
    title: string;
    itemCount: number;
    itemType: 'text' | 'contact'; // what type of items are in this list
    searchQuery?: string;
  };
}

// Union type of all possible asset content decorators (matches ChatMessageDecorator pattern)
export type AssetContentDecorators = 
  | ContactDecorator
  | ListDecorator;

// Structured asset content interface (matches StructuredMessageContent pattern)
export interface StructuredAssetContent {
  type: 'text' | 'list' | 'contact';
  content: string;
  decorators?: AssetContentDecorators[];
  metadata?: Record<string, any>;
}

// Asset content type - supports both legacy string content and structured content (matches ChatMessageContent pattern)
export type AssetContent = string | StructuredAssetContent;

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
  content: AssetContent;
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
  content: AssetContent;
  author: string;
  metadata?: any;
} 