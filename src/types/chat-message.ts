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

export interface StreamingDecorator extends MessageDecorator {
  type: 'streaming';
  data: {
    streamId: string;
    isActive: boolean;
    chunkCount?: number;
    totalChunks?: number;
    streamMetadata?: Record<string, any>;
  };
}

export interface TypingDecorator extends MessageDecorator {
  type: 'typing';
  data: {
    isTyping: boolean;
    typingSpeed?: 'slow' | 'normal' | 'fast';
    estimatedDuration?: number;
  };
}

// Union type of all possible decorators
export type ChatMessageDecorator = 
  | AssetDecorator
  | WorkflowTitleDecorator
  | SystemNotificationDecorator
  | ButtonDecorator
  | ProgressDecorator
  | MediaContactsDecorator
  | StreamingDecorator
  | TypingDecorator;

// Structured content interface
export interface StructuredMessageContent {
  type: 'text' | 'asset' | 'system' | 'workflow_update' | 'streaming';
  text: string;
  decorators?: ChatMessageDecorator[];
  metadata?: Record<string, any>;
}

// Streaming-specific interfaces
export interface StreamingEvent {
  type: 'connected' | 'message_saved' | 'workflow_status' | 'ai_response' | 'workflow_complete' | 'error' | 'done';
  data: any;
  timestamp: string;
}

export interface StreamingAIResponseEvent extends StreamingEvent {
  type: 'ai_response';
  data: {
    content: string;
    isComplete: boolean;
    accumulated?: string;
    chunkIndex?: number;
    streamId?: string;
  };
}

export interface StreamingErrorEvent extends StreamingEvent {
  type: 'error';
  data: {
    error: string;
    message?: string;
    threadId?: string;
    stepId?: string;
  };
}

export interface StreamingWorkflowStatusEvent extends StreamingEvent {
  type: 'workflow_status';
  data: {
    status: 'workflow_created' | 'workflow_transition' | 'step_complete' | 'step_started';
    workflowId?: string;
    stepId?: string;
    selectedWorkflow?: string;
    newWorkflowId?: string;
  };
}

export interface StreamingMessageSavedEvent extends StreamingEvent {
  type: 'message_saved';
  data: {
    message: ChatMessage;
    wasDuplicate?: boolean;
  };
}

export interface StreamingConnectedEvent extends StreamingEvent {
  type: 'connected';
  data: {
    threadId: string;
    streamId?: string;
  };
}

export interface StreamingCompleteEvent extends StreamingEvent {
  type: 'workflow_complete';
  data: {
    message: string;
    workflowId?: string;
  };
}

export interface StreamingDoneEvent extends StreamingEvent {
  type: 'done';
  data: {
    success?: boolean;
    error?: boolean;
    completed?: boolean;
  };
}

// Union type for all streaming events
export type StreamingChatEvent = 
  | StreamingConnectedEvent
  | StreamingMessageSavedEvent
  | StreamingWorkflowStatusEvent
  | StreamingAIResponseEvent
  | StreamingCompleteEvent
  | StreamingErrorEvent
  | StreamingDoneEvent;

// Streaming state management
export interface StreamingChatState {
  isStreaming: boolean;
  currentStreamId?: string;
  accumulatedContent: string;
  lastEventType?: StreamingEvent['type'];
  error?: string;
  isComplete: boolean;
  metadata?: Record<string, any>;
}

// Streaming message interface
export interface StreamingChatMessage extends ChatMessage {
  isStreaming?: boolean;
  streamId?: string;
  chunkCount?: number;
  streamingComplete?: boolean;
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
   * Create a streaming message
   */
  static createStreamingMessage(
    text: string,
    streamId: string,
    isActive: boolean = true,
    options: {
      chunkCount?: number;
      totalChunks?: number;
      streamMetadata?: Record<string, any>;
    } = {}
  ): StructuredMessageContent {
    return {
      type: 'streaming',
      text,
      decorators: [
        {
          type: 'streaming',
          data: {
            streamId,
            isActive,
            chunkCount: options.chunkCount,
            totalChunks: options.totalChunks,
            streamMetadata: options.streamMetadata
          }
        },
        {
          type: 'typing',
          data: {
            isTyping: isActive,
            typingSpeed: 'normal'
          }
        }
      ]
    };
  }

  /**
   * Update streaming message content
   */
  static updateStreamingMessage(
    existingContent: StructuredMessageContent,
    newText: string,
    isComplete: boolean = false
  ): StructuredMessageContent {
    const streamingDecorator = this.getDecorator(existingContent, 'streaming') as StreamingDecorator;
    const typingDecorator = this.getDecorator(existingContent, 'typing') as TypingDecorator;
    
    return {
      ...existingContent,
      text: newText,
      decorators: existingContent.decorators?.map(decorator => {
        if (decorator.type === 'streaming') {
          return {
            ...decorator,
            data: {
              ...decorator.data,
              isActive: !isComplete,
              chunkCount: (decorator.data.chunkCount || 0) + 1
            }
          };
        }
        if (decorator.type === 'typing') {
          return {
            ...decorator,
            data: {
              ...decorator.data,
              isTyping: !isComplete
            }
          };
        }
        return decorator;
      }) || []
    };
  }

  /**
   * Create a typing indicator message
   */
  static createTypingMessage(
    text: string = 'AI is thinking...',
    typingSpeed: 'slow' | 'normal' | 'fast' = 'normal'
  ): StructuredMessageContent {
    return {
      type: 'streaming',
      text,
      decorators: [
        {
          type: 'typing',
          data: {
            isTyping: true,
            typingSpeed,
            estimatedDuration: typingSpeed === 'fast' ? 1000 : typingSpeed === 'slow' ? 3000 : 2000
          }
        }
      ]
    };
  }

  /**
   * Check if message is currently streaming
   */
  static isStreaming(content: ChatMessageContent): boolean {
    const streamingDecorator = this.getDecorator(content, 'streaming') as StreamingDecorator;
    return streamingDecorator?.data.isActive || false;
  }

  /**
   * Check if message has typing indicator
   */
  static isTyping(content: ChatMessageContent): boolean {
    const typingDecorator = this.getDecorator(content, 'typing') as TypingDecorator;
    return typingDecorator?.data.isTyping || false;
  }

  /**
   * Get streaming progress information
   */
  static getStreamingProgress(content: ChatMessageContent): {
    chunkCount?: number;
    totalChunks?: number;
    percentage?: number;
  } {
    const streamingDecorator = this.getDecorator(content, 'streaming') as StreamingDecorator;
    if (!streamingDecorator) return {};

    const { chunkCount, totalChunks } = streamingDecorator.data;
    const percentage = chunkCount && totalChunks ? Math.round((chunkCount / totalChunks) * 100) : undefined;

    return { chunkCount, totalChunks, percentage };
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

// Streaming utilities and hooks helpers
export class StreamingChatHelper {
  /**
   * Parse Server-Sent Event data
   */
  static parseSSEEvent(data: string): StreamingChatEvent | null {
    try {
      return JSON.parse(data) as StreamingChatEvent;
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
      return null;
    }
  }

  /**
   * Create initial streaming state
   */
  static createInitialStreamingState(): StreamingChatState {
    return {
      isStreaming: false,
      accumulatedContent: '',
      isComplete: false
    };
  }

  /**
   * Update streaming state based on event
   */
  static updateStreamingState(
    currentState: StreamingChatState,
    event: StreamingChatEvent
  ): StreamingChatState {
    switch (event.type) {
      case 'connected':
        return {
          ...currentState,
          isStreaming: true,
          currentStreamId: event.data.streamId,
          accumulatedContent: '',
          isComplete: false,
          error: undefined
        };

      case 'ai_response':
        return {
          ...currentState,
          accumulatedContent: event.data.accumulated || (currentState.accumulatedContent + (event.data.content || '')),
          lastEventType: 'ai_response',
          isComplete: event.data.isComplete || false
        };

      case 'error':
        return {
          ...currentState,
          isStreaming: false,
          error: event.data.error,
          isComplete: true,
          lastEventType: 'error'
        };

      case 'done':
      case 'workflow_complete':
        return {
          ...currentState,
          isStreaming: false,
          isComplete: true,
          lastEventType: event.type
        };

      default:
        return {
          ...currentState,
          lastEventType: event.type
        };
    }
  }

  /**
   * Create a streaming message from accumulated content
   */
  static createMessageFromStream(
    streamingState: StreamingChatState,
    threadId: string,
    messageId: string = crypto.randomUUID()
  ): StreamingChatMessage {
    const content = streamingState.isStreaming && !streamingState.isComplete
      ? MessageContentHelper.createStreamingMessage(
          streamingState.accumulatedContent,
          streamingState.currentStreamId || '',
          true
        )
      : MessageContentHelper.createTextMessage(streamingState.accumulatedContent);

    return {
      id: messageId,
      threadId,
      userId: 'assistant',
      role: 'assistant',
      content,
      createdAt: new Date(),
      isStreaming: streamingState.isStreaming,
      streamId: streamingState.currentStreamId,
      streamingComplete: streamingState.isComplete
    };
  }

  /**
   * Validate streaming event structure
   */
  static isValidStreamingEvent(data: any): data is StreamingChatEvent {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.type === 'string' &&
      ['connected', 'message_saved', 'workflow_status', 'ai_response', 'workflow_complete', 'error', 'done'].includes(data.type) &&
      data.data !== undefined &&
      typeof data.timestamp === 'string'
    );
  }

  /**
   * Get event priority for UI handling (higher number = higher priority)
   */
  static getEventPriority(eventType: StreamingEvent['type']): number {
    const priorities = {
      'error': 100,
      'workflow_complete': 90,
      'done': 80,
      'ai_response': 70,
      'workflow_status': 60,
      'message_saved': 50,
      'connected': 40
    };
    return priorities[eventType] || 0;
  }

  /**
   * Determine if event should interrupt current streaming
   */
  static shouldInterruptStream(eventType: StreamingEvent['type']): boolean {
    return ['error', 'workflow_complete', 'done'].includes(eventType);
  }
} 