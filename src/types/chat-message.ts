// Base interface for message decorators
export interface MessageDecorator {
  type: string;
  data?: Record<string, any>;
}

// Specific decorator types
export interface AssetDecorator extends MessageDecorator {
  type: 'asset';
  data: {
    assetType: string;
    assetId?: string;
    stepId: string;
    stepName: string;
    isRevision?: boolean;
    showCreateButton?: boolean;
  };
}

export interface WorkflowTitleDecorator extends MessageDecorator {
  type: 'workflow_title';
  data: {
    title: string;
    workflowType: string;
  };
}

export interface SystemNotificationDecorator extends MessageDecorator {
  type: 'system_notification';
  data: {
    notificationType: 'step_complete' | 'workflow_complete' | 'error' | 'info';
    level: 'info' | 'warning' | 'error' | 'success';
  };
}

export interface ButtonDecorator extends MessageDecorator {
  type: 'button';
  data: {
    buttonType: 'create_asset' | 'approve' | 'regenerate' | 'next_step';
    text: string;
    action: string;
    variant?: 'default' | 'primary' | 'secondary' | 'outline';
  };
}

export interface ProgressDecorator extends MessageDecorator {
  type: 'progress';
  data: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
    percentage: number;
  };
}

export interface MediaContactsDecorator extends MessageDecorator {
  type: 'media_contacts';
  data: {
    contactCount: number;
    searchQuery: string;
    showExportButton?: boolean;
  };
}

// Union type of all possible decorators
export type ChatMessageDecorator = 
  | AssetDecorator
  | WorkflowTitleDecorator
  | SystemNotificationDecorator
  | ButtonDecorator
  | ProgressDecorator
  | MediaContactsDecorator;

// Structured content interface
export interface StructuredMessageContent {
  type: 'text' | 'asset' | 'system' | 'workflow_update';
  text: string;
  decorators?: ChatMessageDecorator[];
  metadata?: Record<string, any>;
}

// Legacy content support - for backward compatibility during migration
export type ChatMessageContent = string | StructuredMessageContent;

// Updated ChatMessage interface
export interface ChatMessage {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: ChatMessageContent;
  createdAt: Date;
  hideFromUser?: boolean;
}

// Database representation
export interface ChatMessageDB {
  id: string;
  threadId: string;
  userId: string;
  role: string;
  content: string | object; // Will be JSONB in database
  createdAt: Date;
}

// Helper functions for working with structured content
export class MessageContentHelper {
  /**
   * Create a simple text message
   */
  static createTextMessage(text: string): StructuredMessageContent {
    return {
      type: 'text',
      text,
      decorators: []
    };
  }

  /**
   * Create an asset message with create button
   */
  static createAssetMessage(
    text: string,
    assetType: string,
    stepId: string,
    stepName: string,
    options: {
      assetId?: string;
      isRevision?: boolean;
      showCreateButton?: boolean;
    } = {}
  ): StructuredMessageContent {
    return {
      type: 'asset',
      text,
      decorators: [
        {
          type: 'asset',
          data: {
            assetType,
            stepId,
            stepName,
            assetId: options.assetId,
            isRevision: options.isRevision || false,
            showCreateButton: options.showCreateButton !== false // Re-enable decorator buttons - will be hidden in dev mode on frontend
          }
        }
        // Removed duplicate button decorator - asset decorator handles the button
      ]
    };
  }

  /**
   * Create a system notification message
   */
  static createSystemMessage(
    text: string,
    notificationType: 'step_complete' | 'workflow_complete' | 'error' | 'info',
    level: 'info' | 'warning' | 'error' | 'success' = 'info'
  ): StructuredMessageContent {
    return {
      type: 'system',
      text,
      decorators: [
        {
          type: 'system_notification',
          data: {
            notificationType,
            level
          }
        }
      ]
    };
  }

  /**
   * Create a workflow title update message
   */
  static createWorkflowTitleMessage(
    title: string,
    workflowType: string
  ): StructuredMessageContent {
    return {
      type: 'workflow_update',
      text: `Thread title updated: ${title}`,
      decorators: [
        {
          type: 'workflow_title',
          data: {
            title,
            workflowType
          }
        }
      ]
    };
  }

  /**
   * Create a progress update message
   */
  static createProgressMessage(
    text: string,
    currentStep: number,
    totalSteps: number,
    stepName: string
  ): StructuredMessageContent {
    const percentage = Math.round((currentStep / totalSteps) * 100);
    return {
      type: 'workflow_update',
      text,
      decorators: [
        {
          type: 'progress',
          data: {
            currentStep,
            totalSteps,
            stepName,
            percentage
          }
        }
      ]
    };
  }

  /**
   * Create a media contacts message
   */
  static createMediaContactsMessage(
    text: string,
    contactCount: number,
    searchQuery: string,
    showExportButton: boolean = true
  ): StructuredMessageContent {
    return {
      type: 'asset',
      text,
      decorators: [
        {
          type: 'media_contacts',
          data: {
            contactCount,
            searchQuery,
            showExportButton
          }
        },
        ...(showExportButton ? [{
          type: 'button' as const,
          data: {
            buttonType: 'create_asset' as const,
            text: 'Export Media List',
            action: 'create_asset',
            variant: 'primary' as const
          }
        } as ButtonDecorator] : [])
      ]
    };
  }

  /**
   * Check if content is structured
   */
  static isStructured(content: ChatMessageContent): content is StructuredMessageContent {
    return typeof content === 'object' && content !== null && 'type' in content;
  }

  /**
   * Get text content from any message content type
   */
  static getText(content: ChatMessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    return content.text;
  }

  /**
   * Get decorators from message content
   */
  static getDecorators(content: ChatMessageContent): ChatMessageDecorator[] {
    if (typeof content === 'string') {
      return [];
    }
    return content.decorators || [];
  }

  /**
   * Check if message has a specific decorator type
   */
  static hasDecorator(content: ChatMessageContent, decoratorType: string): boolean {
    return this.getDecorators(content).some(d => d.type === decoratorType);
  }

  /**
   * Get a specific decorator from message content
   */
  static getDecorator<T extends ChatMessageDecorator>(
    content: ChatMessageContent, 
    decoratorType: T['type']
  ): T | undefined {
    return this.getDecorators(content).find(d => d.type === decoratorType) as T | undefined;
  }

  /**
   * Convert legacy string content to structured content (for migration)
   */
  static fromLegacyContent(content: string): StructuredMessageContent {
    // Check for asset data markers
    const assetDataMatch = content.match(/\[ASSET_DATA\](.*?)\[\/ASSET_DATA\]/);
    if (assetDataMatch) {
      try {
        const assetData = JSON.parse(assetDataMatch[1]);
        const textContent = content.replace(assetDataMatch[0], '').trim();
        
        return this.createAssetMessage(
          textContent,
          assetData.assetType || 'Document',
          assetData.stepId || '',
          assetData.stepName || '',
          {
            isRevision: assetData.isRevision || false,
            showCreateButton: true
          }
        );
      } catch (error) {
        // If parsing fails, treat as regular text
        return this.createTextMessage(content);
      }
    }

    // Check for system messages
    if (content.includes('[System]') || content.includes('Thread title updated')) {
      if (content.includes('Thread title updated')) {
        const titleMatch = content.match(/Thread title updated: (.+)/);
        if (titleMatch) {
          return this.createWorkflowTitleMessage(titleMatch[1], 'Unknown');
        }
      }
      return this.createSystemMessage(content, 'info');
    }

    // Default to text message
    return this.createTextMessage(content);
  }

  /**
   * Convert structured content to legacy string format (for backward compatibility)
   */
  static toLegacyContent(content: StructuredMessageContent): string {
    const assetDecorator = this.getDecorator(content, 'asset') as AssetDecorator;
    if (assetDecorator) {
      const assetData = {
        type: 'asset_generated',
        assetType: assetDecorator.data.assetType,
        content: content.text,
        displayContent: content.text,
        stepId: assetDecorator.data.stepId,
        stepName: assetDecorator.data.stepName,
        isRevision: assetDecorator.data.isRevision || false
      };
      return `[ASSET_DATA]${JSON.stringify(assetData)}[/ASSET_DATA]\n\n${content.text}`;
    }

    return content.text;
  }
} 