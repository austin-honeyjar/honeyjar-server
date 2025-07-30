import { 
  AssetContent, 
  StructuredAssetContent, 
  AssetContentDecorators, 
  ContactDecorator, 
  ListDecorator
} from '../types/asset';

/**
 * Helper class for working with structured asset content
 * Follows the same pattern as MessageContentHelper
 * Supports three core types: text, list, contact
 */
export class AssetContentHelper {
  /**
   * Create a simple text asset
   */
  static createTextAsset(content: string): StructuredAssetContent {
    return {
      type: 'text',
      content,
      decorators: []
    };
  }

  /**
   * Create a list asset (collection of text or contacts)
   */
  static createListAsset(
    content: string,
    title: string,
    itemCount: number,
    itemType: 'text' | 'contact',
    searchQuery?: string
  ): StructuredAssetContent {
    return {
      type: 'list',
      content,
      decorators: [
        {
          type: 'list',
          data: {
            title,
            itemCount,
            itemType,
            searchQuery
          }
        }
      ]
    };
  }

  /**
   * Create a contact asset
   */
  static createContactAsset(
    content: string,
    name: string,
    email: string,
    publication?: string,
    relevanceScore?: number
  ): StructuredAssetContent {
    return {
      type: 'contact',
      content,
      decorators: [
        {
          type: 'contact',
          data: {
            name,
            email,
            publication,
            relevanceScore
          }
        }
      ]
    };
  }

  /**
   * Check if asset content is structured
   */
  static isStructured(content: AssetContent): content is StructuredAssetContent {
    return typeof content === 'object' && content !== null && 'type' in content;
  }

  /**
   * Get text content from any asset content type (matches MessageContentHelper.getText)
   */
  static getContent(content: AssetContent): string {
    if (typeof content === 'string') {
      return content;
    }
    return content.content;
  }

  /**
   * Get decorators from asset content (matches MessageContentHelper.getDecorators)
   */
  static getDecorators(content: AssetContent): AssetContentDecorators[] {
    if (typeof content === 'string') {
      return [];
    }
    return content.decorators || [];
  }

  /**
   * Check if asset has a specific decorator type (matches MessageContentHelper.hasDecorator)
   */
  static hasDecorator(content: AssetContent, decoratorType: string): boolean {
    return this.getDecorators(content).some(d => d.type === decoratorType);
  }

  /**
   * Get a specific decorator from asset content (matches MessageContentHelper.getDecorator)
   */
  static getDecorator<T extends AssetContentDecorators>(
    content: AssetContent, 
    decoratorType: T['type']
  ): T | undefined {
    return this.getDecorators(content).find(d => d.type === decoratorType) as T | undefined;
  }

  /**
   * Add contact decorator to asset
   */
  static addContactDecorator(
    content: AssetContent,
    name: string,
    email: string,
    publication?: string,
    relevanceScore?: number
  ): StructuredAssetContent {
    const contactDecorator: ContactDecorator = {
      type: 'contact',
      data: {
        name,
        email,
        publication,
        relevanceScore
      }
    };

    if (this.isStructured(content)) {
      return {
        ...content,
        decorators: [...(content.decorators || []), contactDecorator]
      };
    }
    
    // Create new structured asset with contact decorator
    return {
      type: 'text',
      content,
      decorators: [contactDecorator]
    };
  }

  /**
   * Get contact count from decorators
   */
  static getContactCount(content: AssetContent): number {
    return this.getDecorators(content).filter(d => d.type === 'contact').length;
  }

  /**
   * Get item count from list decorator
   */
  static getListItemCount(content: AssetContent): number {
    const listDecorator = this.getDecorator<ListDecorator>(content, 'list');
    return listDecorator?.data.itemCount || 0;
  }

  /**
   * Check if content is a list asset
   */
  static isListAsset(content: AssetContent): boolean {
    if (this.isStructured(content)) {
      return content.type === 'list' || this.hasDecorator(content, 'list');
    }
    return false;
  }

  /**
   * Check if content is a contact asset
   */
  static isContactAsset(content: AssetContent): boolean {
    if (this.isStructured(content)) {
      return content.type === 'contact' || this.hasDecorator(content, 'contact');
    }
    return false;
  }

  /**
   * Convert legacy string content to structured format (matches MessageContentHelper.fromLegacyContent)
   */
  static fromLegacyContent(content: string, assetType?: string): AssetContent {
    // Simple detection - if it looks like structured content already, return as-is
    if (content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type && parsed.content) {
          return parsed as StructuredAssetContent;
        }
      } catch (error) {
        // Not valid JSON, treat as plain text
      }
    }

    // For now, just return as text - can enhance later
    return content;
  }

  /**
   * Serialize structured content for database storage
   */
  static serialize(content: AssetContent): string | object {
    if (this.isStructured(content)) {
      return content; // Database will handle JSON serialization
    }
    return content;
  }

  /**
   * Deserialize content from database
   */
  static deserialize(content: string | object): AssetContent {
    if (typeof content === 'object') {
      return content as StructuredAssetContent;
    }
    return content;
  }
} 