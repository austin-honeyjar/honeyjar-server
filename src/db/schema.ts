import { pgTable, serial, text, timestamp, uuid, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// CSV Metadata table
export const csvMetadata = pgTable('csv_metadata', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  columnNames: text('column_names').array().notNull(),
  fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Chat threads table
export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  orgId: text('org_id'),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Chat messages table
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Helper function to create dynamic table schemas for CSV data
export const createDynamicTableSchema = (tableName: string, columnNames: string[]) => {
  const columns: Record<string, any> = {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  };

  columnNames.forEach((colName) => {
    const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    columns[safeColName] = text(safeColName);
  });

  return pgTable(tableName, columns);
};

// Workflow status enum
export const workflowStatusEnum = pgEnum('workflow_status', ['active', 'completed', 'failed']);

// Workflow step status enum
export const stepStatusEnum = pgEnum('step_status', ['pending', 'in_progress', 'complete', 'failed']);

// Workflow step type enum
export const stepTypeEnum = pgEnum('step_type', ['ai_suggestion', 'user_input', 'api_call', 'data_transformation']);

// Workflow templates table
export const workflowTemplates = pgTable('workflow_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  steps: jsonb('steps').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Workflows table
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id),
  templateId: uuid('template_id').notNull().references(() => workflowTemplates.id),
  status: workflowStatusEnum('status').notNull().default('active'),
  currentStepId: uuid('current_step_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Workflow steps table
export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
  stepType: stepTypeEnum('step_type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  prompt: text('prompt'),
  status: stepStatusEnum('status').notNull().default('pending'),
  order: integer('order').notNull(),
  dependencies: jsonb('dependencies').notNull().default('[]'),
  metadata: jsonb('metadata'),
  aiSuggestion: text('ai_suggestion'),
  userInput: text('user_input'),
  openAIPrompt: text('openai_prompt'),
  openAIResponse: text('openai_response'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Workflow history table
export const workflowHistory = pgTable('workflow_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
  stepId: uuid('step_id').references(() => workflowSteps.id),
  action: text('action').notNull(),
  previousState: jsonb('previous_state').notNull(),
  newState: jsonb('new_state').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Define relations
export const chatThreadsRelations = relations(chatThreads, ({ many }: { many: any }) => ({
  messages: many(chatMessages),
  workflows: many(workflows),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }: { one: any }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ many }: { many: any }) => ({
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one, many }: { one: any; many: any }) => ({
  thread: one(chatThreads, {
    fields: [workflows.threadId],
    references: [chatThreads.id],
  }),
  template: one(workflowTemplates, {
    fields: [workflows.templateId],
    references: [workflowTemplates.id],
  }),
  steps: many(workflowSteps),
  history: many(workflowHistory),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one, many }: { one: any; many: any }) => ({
  workflow: one(workflows, {
    fields: [workflowSteps.workflowId],
    references: [workflows.id],
  }),
  history: many(workflowHistory),
}));

export const workflowHistoryRelations = relations(workflowHistory, ({ one }: { one: any }) => ({
  workflow: one(workflows, {
    fields: [workflowHistory.workflowId],
    references: [workflows.id],
  }),
  step: one(workflowSteps, {
    fields: [workflowHistory.stepId],
    references: [workflowSteps.id],
  }),
})); 