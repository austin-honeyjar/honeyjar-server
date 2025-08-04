# Streaming Chat System

This document describes the upgraded chat system with real-time streaming capabilities.

## Overview

The chat system has been upgraded to support real-time streaming responses using OpenAI's streaming API and Server-Sent Events (SSE). This provides a much more responsive user experience where AI responses are displayed as they are generated, rather than waiting for the complete response.

## New Components

### 1. OpenAI Service Streaming (`src/services/openai.service.ts`)

#### `generateStepResponseStream()`
- **Purpose**: Generates streaming AI responses for workflow steps
- **Returns**: AsyncGenerator that yields response chunks in real-time
- **Features**:
  - Respects step-specific token limits and response guidelines
  - Handles sentence-level streaming for chat steps (limits to 2 sentences)
  - Provides metadata and completion events
  - Maintains all existing OpenAI service functionality

```typescript
// Usage example
for await (const chunk of openaiService.generateStepResponseStream(step, userInput, previousResponses)) {
  if (chunk.type === 'content') {
    console.log('Streaming content:', chunk.data.content);
  } else if (chunk.type === 'done') {
    console.log('Response complete:', chunk.data.fullResponse);
  }
}
```

### 2. Enhanced Workflow Service Streaming (`src/services/enhanced-workflow.service.ts`)

#### `handleStepResponseStream()`
- **Purpose**: Handles streaming step responses without enhanced context
- **Features**: Basic streaming with workflow state management

#### `handleStepResponseStreamWithContext()`
- **Purpose**: Handles streaming step responses with full RAG context and personalization
- **Features**:
  - RAG context integration
  - Security filtering
  - User personalization
  - Enhanced metadata

### 3. Chat Service Streaming (`src/services/chat.service.ts`)

#### `handleUserMessageStream()`
- **Purpose**: Main streaming message handler for chat interactions
- **Returns**: AsyncGenerator yielding different event types:
  - `message_saved`: User message stored in database
  - `workflow_status`: Workflow state changes
  - `ai_response`: Streaming AI response content
  - `workflow_complete`: Workflow completion
  - `error`: Error events

```typescript
// Usage example
for await (const chunk of chatService.handleUserMessageStream(threadId, content, userId, orgId)) {
  switch (chunk.type) {
    case 'ai_response':
      updateUI(chunk.data.content);
      break;
    case 'workflow_complete':
      showCompletion(chunk.data.message);
      break;
    case 'error':
      handleError(chunk.data.error);
      break;
  }
}
```

### 4. Streaming Routes (`src/routes/chat.routes.ts`)

New endpoints for streaming chat functionality:

#### `POST /threads/:threadId/messages/stream`
- **Purpose**: Stream AI responses in real-time using Server-Sent Events
- **Headers**: 
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **Response Format**: SSE events with JSON data

## API Endpoints

### Standard Chat Endpoints

1. **Create Thread**
   ```
   POST /chat/threads
   Body: { "title": "Chat Title" }
   Response: { "thread": { "id": "...", "title": "...", ... } }
   ```

2. **Get Messages**
   ```
   GET /chat/threads/:threadId/messages
   Response: { "messages": [...] }
   ```

3. **Send Message (Non-Streaming)**
   ```
   POST /chat/threads/:threadId/messages
   Body: { "content": "User message" }
   Response: { "response": "AI response" }
   ```

### Streaming Endpoints

4. **Send Message (Streaming)**
   ```
   POST /chat/threads/:threadId/messages/stream
   Body: { "content": "User message" }
   Response: Server-Sent Events stream
   ```

## Server-Sent Events Format

The streaming endpoint returns events in the following format:

```
data: {"type": "connected", "data": {"threadId": "..."}, "timestamp": "..."}

data: {"type": "message_saved", "data": {"message": {...}}, "timestamp": "..."}

data: {"type": "ai_response", "data": {"content": "Hello", "isComplete": false}, "timestamp": "..."}

data: {"type": "ai_response", "data": {"content": " world!", "isComplete": true}, "timestamp": "..."}

data: {"type": "done", "data": {"success": true}, "timestamp": "..."}
```

### Event Types

- **`connected`**: Initial connection established
- **`message_saved`**: User message saved to database
- **`workflow_status`**: Workflow state changes (creation, transitions)
- **`ai_response`**: Streaming AI response chunks
- **`workflow_complete`**: Workflow completion
- **`error`**: Error occurred
- **`done`**: Stream completion

## Client Implementation Example

### JavaScript/TypeScript Client

```javascript
async function sendStreamingMessage(threadId, content) {
  const response = await fetch(`/chat/threads/${threadId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ content })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          handleEvent(event);
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    }
  }
}

function handleEvent(event) {
  switch (event.type) {
    case 'ai_response':
      if (event.data.isComplete) {
        completeMessage(event.data.accumulated);
      } else {
        appendToMessage(event.data.content);
      }
      break;
    case 'error':
      showError(event.data.error);
      break;
    case 'done':
      finishStream();
      break;
  }
}
```

### React Hook Example

```typescript
import { useState, useCallback } from 'react';

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');

  const sendStreamingMessage = useCallback(async (threadId: string, content: string) => {
    setIsStreaming(true);
    setCurrentMessage('');

    try {
      const response = await fetch(`/chat/threads/${threadId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              
              if (event.type === 'ai_response') {
                setCurrentMessage(prev => prev + (event.data.content || ''));
              }
            } catch (e) {
              console.error('Failed to parse event:', e);
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { sendStreamingMessage, isStreaming, currentMessage };
}
```

## Error Handling

The streaming system includes comprehensive error handling:

1. **Connection Errors**: Handled at the route level with proper HTTP status codes
2. **Streaming Errors**: Sent as SSE error events with detailed error information
3. **Client Disconnection**: Automatic cleanup when clients disconnect
4. **Timeout Handling**: Built-in timeouts to prevent hanging connections
5. **Fallback**: Non-streaming endpoints remain available as fallback

## Performance Considerations

1. **Memory Usage**: Streaming reduces memory usage by not buffering complete responses
2. **Response Time**: Users see responses immediately as they're generated
3. **Bandwidth**: Similar bandwidth usage but better perceived performance
4. **Concurrent Connections**: Monitor SSE connection limits on your server

## Security

- All streaming endpoints require authentication
- User context is properly validated and sanitized
- RAG context filtering maintains security levels
- No sensitive data is exposed in streaming metadata

## Migration Guide

### For Existing Clients

1. **No Breaking Changes**: Existing non-streaming endpoints continue to work
2. **Gradual Migration**: Implement streaming incrementally
3. **Feature Detection**: Check for streaming support before using new endpoints

### For Developers

1. **Add Streaming Support**: Use new streaming methods in services
2. **Update UI**: Implement progressive message display
3. **Error Handling**: Add SSE-specific error handling
4. **Testing**: Test with various network conditions and connection failures

## Troubleshooting

### Common Issues

1. **Events Not Received**: Check Content-Type header and SSE parsing
2. **Connection Drops**: Implement reconnection logic
3. **Duplicate Messages**: Check for proper event deduplication
4. **Performance Issues**: Monitor concurrent SSE connections

### Debug Logging

Enable debug logging to troubleshoot streaming issues:

```typescript
// In your environment
DEBUG=chat:streaming npm start
```

The system logs detailed information about:
- Stream initialization
- Event generation
- Client connections/disconnections
- Error conditions

## Future Enhancements

Planned improvements for the streaming system:

1. **WebSocket Support**: Alternative to SSE for better bidirectional communication
2. **Message Queuing**: Handle high-volume scenarios with message queues
3. **Real-time Collaboration**: Multi-user chat with real-time updates
4. **Enhanced Metadata**: More detailed progress and context information
5. **Compression**: Gzip compression for large streaming responses 