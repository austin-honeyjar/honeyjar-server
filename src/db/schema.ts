import { pgTable, serial, text, timestamp, uuid, jsonb, integer, pgEnum, boolean, real } from 'drizzle-orm/pg-core';
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

// RocketReach API call type enum
export const rocketReachApiCallTypeEnum = pgEnum('rocketreach_api_call_type', ['person_lookup', 'person_search', 'company_lookup', 'company_search', 'bulk_lookup', 'account']);

// =============================================================================
// NEWS PIPELINE ENUMS
// =============================================================================

// News pipeline run status enum
export const pipelineRunStatusEnum = pgEnum('pipeline_run_status', ['running', 'completed', 'failed', 'partial']);

// News pipeline run type enum  
export const pipelineRunTypeEnum = pgEnum('pipeline_run_type', ['daily_sync', 'author_scoring', 'cleanup', 'manual']);

// Monitoring event severity enum
export const monitoringEventSeverityEnum = pgEnum('monitoring_event_severity', ['low', 'medium', 'high', 'critical']);

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
// NEWS PIPELINE TABLES
// =============================================================================

// News author relevance tracking and scoring
export const newsAuthors = pgTable('news_authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  organization: text('organization'),
  domain: text('domain'), // Company domain for contact matching
  relevanceScore: real('relevance_score').notNull().default(0.0),
  articleCount: integer('article_count').notNull().default(0),
  recentActivityScore: real('recent_activity_score').notNull().default(0.0),
  topics: jsonb('topics').notNull().default('[]'), // Areas of expertise/coverage
  locations: jsonb('locations').notNull().default('[]'), // Geographic coverage areas
  contactInfo: jsonb('contact_info').default('{}'), // Phone, social media, etc.
  lastArticleDate: timestamp('last_article_date', { withTimezone: true }),
  firstSeenDate: timestamp('first_seen_date', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').notNull().default('{}'), // Additional scoring factors
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// News pipeline processing runs and logs
export const newsPipelineRuns = pgTable('news_pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runType: pipelineRunTypeEnum('run_type').notNull(),
  status: pipelineRunStatusEnum('status').notNull(),
  articlesProcessed: integer('articles_processed').default(0),
  articlesFiltered: integer('articles_filtered').default(0), // Articles that passed filtering
  authorsUpdated: integer('authors_updated').default(0),
  authorsCreated: integer('authors_created').default(0),
  recordsCleaned: integer('records_cleaned').default(0),
  executionTime: integer('execution_time'), // milliseconds
  sequenceIdStart: text('sequence_id_start'), // Starting sequence ID for sync
  sequenceIdEnd: text('sequence_id_end'), // Ending sequence ID for sync
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  filtersApplied: jsonb('filters_applied').default('{}'), // Record what filters were used
  metadata: jsonb('metadata').default('{}'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// Production monitoring and alerting events
export const monitoringEvents = pgTable('monitoring_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(), // 'alert', 'error', 'performance', 'compliance', 'health'
  severity: monitoringEventSeverityEnum('severity').notNull(),
  source: text('source').notNull(), // 'news_pipeline', 'compliance', 'api', 'database', 'monitoring'
  title: text('title').notNull(),
  message: text('message').notNull(),
  details: jsonb('details').default('{}'),
  affectedServices: jsonb('affected_services').default('[]'), // Which services are impacted
  resolved: boolean('resolved').default(false),
  resolvedBy: text('resolved_by'), // User or system that resolved
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  escalated: boolean('escalated').default(false),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  notificationSent: boolean('notification_sent').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Author-Article relationship tracking (for scoring)
export const newsAuthorArticles = pgTable('news_author_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => newsAuthors.id, { onDelete: 'cascade' }),
  articleId: text('article_id').notNull().references(() => metabaseArticles.id, { onDelete: 'cascade' }),
  role: text('role').default('author'), // 'author', 'contributor', 'editor', 'source'
  relevanceScore: real('relevance_score').default(1.0), // How relevant this article is to the author
  extractedFrom: text('extracted_from').default('byline'), // 'byline', 'content', 'metadata'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

// =============================================================================
// ROCKETREACH API INTEGRATION TABLES
// =============================================================================

// RocketReach person profiles storage
export const rocketReachPersons = pgTable('rocketreach_persons', {
  id: integer('id').primaryKey(), // RocketReach person ID
  name: text('name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  middleName: text('middle_name'),
  currentEmployer: text('current_employer'),
  currentTitle: text('current_title'),
  linkedinUrl: text('linkedin_url'),
  profilePic: text('profile_pic'),
  location: text('location'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  emails: jsonb('emails').notNull().default('[]'), // Array of email objects
  phones: jsonb('phones').notNull().default('[]'), // Array of phone objects
  socialMedia: jsonb('social_media').default('{}'), // Social media profiles
  workHistory: jsonb('work_history').notNull().default('[]'), // Work experience
  education: jsonb('education').notNull().default('[]'), // Education history
  metadata: jsonb('metadata').notNull().default('{}'), // Additional RocketReach fields
  creditsUsed: integer('credits_used').default(1), // Credits consumed for this lookup
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// RocketReach company profiles storage
export const rocketReachCompanies = pgTable('rocketreach_companies', {
  id: integer('id').primaryKey(), // RocketReach company ID
  name: text('name').notNull(),
  domain: text('domain'),
  linkedinUrl: text('linkedin_url'),
  website: text('website'),
  description: text('description'),
  industry: text('industry'),
  location: text('location'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  foundedYear: integer('founded_year'),
  employees: integer('employees'),
  revenue: text('revenue'),
  technologyStack: jsonb('technology_stack').notNull().default('[]'), // Array of technologies
  socialMedia: jsonb('social_media').default('{}'), // Social media profiles
  metadata: jsonb('metadata').notNull().default('{}'), // Additional RocketReach fields
  creditsUsed: integer('credits_used').default(1), // Credits consumed for this lookup
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// RocketReach API calls logging
export const rocketReachApiCalls = pgTable('rocketreach_api_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callType: rocketReachApiCallTypeEnum('call_type').notNull(),
  endpoint: text('endpoint').notNull(),
  parameters: jsonb('parameters').notNull().default('{}'),
  responseStatus: integer('response_status'),
  responseTime: integer('response_time'), // milliseconds
  recordsReturned: integer('records_returned').default(0),
  creditsUsed: integer('credits_used').default(0), // Credits consumed
  creditsRemaining: integer('credits_remaining'), // Credits remaining after call
  errorMessage: text('error_message'),
  errorCode: text('error_code'), // RocketReach error codes
  cacheHit: boolean('cache_hit').notNull().default(false),
  userId: text('user_id'), // Track which user made the call
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// RocketReach bulk lookup tracking
export const rocketReachBulkLookups = pgTable('rocketreach_bulk_lookups', {
  id: uuid('id').primaryKey().defaultRandom(),
  rocketReachRequestId: text('rocketreach_request_id').notNull().unique(), // ID from RocketReach
  status: text('status').notNull(), // pending, processing, complete, failed
  lookupCount: integer('lookup_count').notNull(),
  webhookId: text('webhook_id'),
  estimatedCompletionTime: timestamp('estimated_completion_time', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  results: jsonb('results').default('[]'), // Webhook results when completed
  creditsUsed: integer('credits_used').default(0),
  errorMessage: text('error_message'),
  userId: text('user_id'), // Track which user initiated the bulk lookup
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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

// =============================================================================
// ROCKETREACH TABLE RELATIONS
// =============================================================================

export const rocketReachApiCallsRelations = relations(rocketReachApiCalls, ({ one }: { one: any }) => ({
  // Relations can be added here if needed for user tracking
}));

export const rocketReachBulkLookupsRelations = relations(rocketReachBulkLookups, ({ one }: { one: any }) => ({
  // Relations can be added here if needed for user tracking
}));

// =============================================================================
// NEWS PIPELINE TABLE RELATIONS
// =============================================================================

export const newsAuthorsRelations = relations(newsAuthors, ({ many }: { many: any }) => ({
  authorArticles: many(newsAuthorArticles),
}));

export const newsAuthorArticlesRelations = relations(newsAuthorArticles, ({ one }: { one: any }) => ({
  author: one(newsAuthors, {
    fields: [newsAuthorArticles.authorId],
    references: [newsAuthors.id],
  }),
  article: one(metabaseArticles, {
    fields: [newsAuthorArticles.articleId],
    references: [metabaseArticles.id],
  }),
}));

export const newsPipelineRunsRelations = relations(newsPipelineRuns, ({ one }: { one: any }) => ({
  // Relations can be added here if needed
}));

export const monitoringEventsRelations = relations(monitoringEvents, ({ one }: { one: any }) => ({
  // Relations can be added here if needed
})); 