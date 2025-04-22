import { z } from 'zod';

// Schema for creating a chat message
export const createChatSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  role: z.enum(['user', 'assistant']).default('user'),
});

// Schema for creating a chat thread
export const createThreadSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Thread title is required')
  })
});

// Schema for getting thread messages
export const getThreadSchema = z.object({
  params: z.object({
    threadId: z.string().min(1, 'Thread ID is required')
  })
});

// Schema for deleting a thread
export const deleteThreadSchema = z.object({
  params: z.object({
    threadId: z.string().min(1, 'Thread ID is required')
  })
});

// Export types
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type CreateThreadInput = z.infer<typeof createThreadSchema>['body'];
export type GetThreadInput = z.infer<typeof getThreadSchema>;
export type DeleteThreadInput = z.infer<typeof deleteThreadSchema>; 