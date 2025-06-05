import { pgTable, serial, text, timestamp, uuid, jsonb, integer, pgEnum, boolean } from 'drizzle-orm/pg-core';
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
export const stepTypeEnum = pgEnum('step_type', ['ai_suggestion', 'user_input', 'api_call', 'data_transformation', 'asset_creation']);

// Metabase compliance status enum
export const complianceStatusEnum = pgEnum('compliance_status', ['compliant', 'overdue', 'error']);

// Metabase API call type enum
export const apiCallTypeEnum = pgEnum('api_call_type', ['articles', 'search', 'revoked', 'compliance_clicks']);

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

// Assets table for storing generated assets from workflows
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'no action' }), // Prevent deletion when thread is deleted
  workflowId: uuid('workflow_id').references(() => workflows.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // e.g., "Press Release", "Media Pitch", "Social Post"
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  content: text('content').notNull(),
  author: text('author').notNull(), // User as author
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// METABASE API INTEGRATION TABLES
// =============================================================================

// Metabase compliance status tracking
export const metabaseComplianceStatus = pgTable('metabase_compliance_status', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkDate: timestamp('check_date', { withTimezone: true }).notNull(),
  revokedArticlesCount: integer('revoked_articles_count').notNull().default(0),
  articlesProcessed: jsonb('articles_processed').notNull().default('[]'),
  status: complianceStatusEnum('status').notNull().default('compliant'),
  nextScheduledCheck: timestamp('next_scheduled_check', { withTimezone: true }),
  errors: jsonb('errors').default('[]'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Metabase articles storage
export const metabaseArticles = pgTable('metabase_articles', {
  id: text('id').primaryKey(), // Using Metabase article ID as primary key
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content'),
  url: text('url').notNull(),
  source: text('source').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  estimatedPublishedDate: timestamp('estimated_published_date', { withTimezone: true }),
  harvestDate: timestamp('harvest_date', { withTimezone: true }),
  author: text('author'),
  topics: jsonb('topics').notNull().default('[]'),
  licenses: jsonb('licenses').notNull().default('[]'),
  clickUrl: text('click_url'), // For compliance clicking
  sequenceId: text('sequence_id'), // For pagination
  metadata: jsonb('metadata').notNull().default('{}'), // Additional Metabase fields
  isRevoked: boolean('is_revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Metabase revoked articles tracking
export const metabaseRevokedArticles = pgTable('metabase_revoked_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: text('article_id').notNull(),
  revokedDate: timestamp('revoked_date', { withTimezone: true }).notNull(),
  sequenceId: text('sequence_id'), // From revoked API response
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  complianceCheckId: uuid('compliance_check_id').references(() => metabaseComplianceStatus.id),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Metabase API calls logging for sync history
export const metabaseApiCalls = pgTable('metabase_api_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callType: apiCallTypeEnum('call_type').notNull(),
  endpoint: text('endpoint').notNull(),
  parameters: jsonb('parameters').notNull().default('{}'),
  responseStatus: integer('response_status'),
  responseTime: integer('response_time'), // milliseconds
  articlesReturned: integer('articles_returned').default(0),
  errorMessage: text('error_message'),
  errorCode: text('error_code'), // Metabase error codes (1000-9999)
  sequenceId: text('sequence_id'), // Last sequence ID from response
  rateLimitInfo: jsonb('rate_limit_info').default('{}'),
  cacheHit: boolean('cache_hit').notNull().default(false),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Define relations
export const chatThreadsRelations = relations(chatThreads, ({ many }: { many: any }) => ({
  messages: many(chatMessages),
  workflows: many(workflows),
  assets: many(assets),
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
  assets: many(assets),
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

export const assetsRelations = relations(assets, ({ one }: { one: any }) => ({
  thread: one(chatThreads, {
    fields: [assets.threadId],
    references: [chatThreads.id],
  }),
  workflow: one(workflows, {
    fields: [assets.workflowId],
    references: [workflows.id],
  }),
}));

// =============================================================================
// METABASE TABLE RELATIONS
// =============================================================================

export const metabaseComplianceStatusRelations = relations(metabaseComplianceStatus, ({ many }: { many: any }) => ({
  revokedArticles: many(metabaseRevokedArticles),
}));

export const metabaseRevokedArticlesRelations = relations(metabaseRevokedArticles, ({ one }: { one: any }) => ({
  complianceCheck: one(metabaseComplianceStatus, {
    fields: [metabaseRevokedArticles.complianceCheckId],
    references: [metabaseComplianceStatus.id],
  }),
})); 