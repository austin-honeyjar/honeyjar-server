/**
 * Helper class for working with asset content
 * Simplified to work with string content since decorators are now in message system
 */
export class AssetContentHelper {
  /**
   * Get text content (simplified since we only use string content now)
   */
  static getContent(content: string): string {
    return content;
  }

  /**
   * Convert legacy string content to string content (simplified)
   */
  static fromLegacyContent(content: string, assetType?: string): string {
    return content;
  }

  /**
   * Convert to plain text (simplified)
   */
  static toPlainText(content: string): string {
    return content;
  }

  /**
   * Validate asset content
   */
  static validate(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!content.trim()) {
      errors.push('Content cannot be empty');
    }

    return { isValid: errors.length === 0, errors };
  }
}