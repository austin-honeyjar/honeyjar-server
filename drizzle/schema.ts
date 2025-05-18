import { pgTable, pgEnum, uuid, text, jsonb, timestamp, foreignKey, unique, serial, integer } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const workflowStatus = pgEnum("workflow_status", ['failed', 'completed', 'active'])
export const stepStatus = pgEnum("step_status", ['failed', 'complete', 'in_progress', 'pending'])
export const stepType = pgEnum("step_type", ['asset_creation', 'data_transformation', 'api_call', 'user_input', 'ai_suggestion'])


export const workflowTemplates = pgTable("workflow_templates", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	name: text("name").notNull(),
	description: text("description").notNull(),
	steps: jsonb("steps").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workflows = pgTable("workflows", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull().references(() => chatThreads.id),
	templateId: uuid("template_id").notNull().references(() => workflowTemplates.id),
	status: workflowStatus("status").default('active').notNull(),
	currentStepId: uuid("current_step_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workflowHistory = pgTable("workflow_history", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
	stepId: uuid("step_id").references(() => workflowSteps.id),
	action: text("action").notNull(),
	previousState: jsonb("previous_state").notNull(),
	newState: jsonb("new_state").notNull(),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull().references(() => chatThreads.id),
	workflowId: uuid("workflow_id").references(() => workflows.id),
	name: text("name").notNull(),
	type: text("type").notNull(),
	title: text("title").notNull(),
	subtitle: text("subtitle"),
	content: text("content").notNull(),
	author: text("author").notNull(),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const csvMetadata = pgTable("csv_metadata", {
	id: serial("id").primaryKey().notNull(),
	tableName: text("table_name").notNull(),
	columnNames: text("column_names").array().notNull(),
	fileName: text("file_name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		csvMetadataTableNameUnique: unique("csv_metadata_table_name_unique").on(table.tableName),
	}
});

export const workflowSteps = pgTable("workflow_steps", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
	stepType: stepType("step_type").notNull(),
	name: text("name").notNull(),
	description: text("description").notNull(),
	prompt: text("prompt"),
	status: stepStatus("status").default('pending').notNull(),
	order: integer("order").notNull(),
	dependencies: jsonb("dependencies").default([]).notNull(),
	metadata: jsonb("metadata"),
	aiSuggestion: text("ai_suggestion"),
	userInput: text("user_input"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	openaiPrompt: text("openai_prompt"),
	openaiResponse: text("openai_response"),
});

export const chatMessages = pgTable("chat_messages", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull().references(() => chatThreads.id),
	userId: text("user_id").notNull(),
	role: text("role").notNull(),
	content: text("content").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const chatThreads = pgTable("chat_threads", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	orgId: text("org_id"),
});