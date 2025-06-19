DO $$ BEGIN
 CREATE TYPE "api_call_type" AS ENUM('articles', 'search', 'revoked', 'compliance_clicks');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "compliance_status" AS ENUM('compliant', 'overdue', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "monitoring_event_severity" AS ENUM('low', 'medium', 'high', 'critical');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "pipeline_run_status" AS ENUM('running', 'completed', 'failed', 'partial');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "pipeline_run_type" AS ENUM('daily_sync', 'author_scoring', 'cleanup', 'manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "rocketreach_api_call_type" AS ENUM('person_lookup', 'person_search', 'company_lookup', 'company_search', 'bulk_lookup', 'account');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metabase_api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_type" "api_call_type" NOT NULL,
	"endpoint" text NOT NULL,
	"parameters" jsonb DEFAULT '{}' NOT NULL,
	"response_status" integer,
	"response_time" integer,
	"articles_returned" integer DEFAULT 0,
	"error_message" text,
	"error_code" text,
	"sequence_id" text,
	"rate_limit_info" jsonb DEFAULT '{}',
	"cache_hit" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metabase_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"published_at" timestamp with time zone,
	"estimated_published_date" timestamp with time zone,
	"harvest_date" timestamp with time zone,
	"author" text,
	"topics" jsonb DEFAULT '[]' NOT NULL,
	"licenses" jsonb DEFAULT '[]' NOT NULL,
	"click_url" text,
	"sequence_id" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metabase_compliance_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_date" timestamp with time zone NOT NULL,
	"revoked_articles_count" integer DEFAULT 0 NOT NULL,
	"articles_processed" jsonb DEFAULT '[]' NOT NULL,
	"status" "compliance_status" DEFAULT 'compliant' NOT NULL,
	"next_scheduled_check" timestamp with time zone,
	"errors" jsonb DEFAULT '[]',
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metabase_revoked_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" text NOT NULL,
	"revoked_date" timestamp with time zone NOT NULL,
	"sequence_id" text,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"compliance_check_id" uuid,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"severity" "monitoring_event_severity" NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}',
	"affected_services" jsonb DEFAULT '[]',
	"resolved" boolean DEFAULT false,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"escalated" boolean DEFAULT false,
	"escalated_at" timestamp with time zone,
	"notification_sent" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_author_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"article_id" text NOT NULL,
	"role" text DEFAULT 'author',
	"relevance_score" real DEFAULT 1,
	"extracted_from" text DEFAULT 'byline',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"organization" text,
	"domain" text,
	"relevance_score" real DEFAULT 0 NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"recent_activity_score" real DEFAULT 0 NOT NULL,
	"topics" jsonb DEFAULT '[]' NOT NULL,
	"locations" jsonb DEFAULT '[]' NOT NULL,
	"contact_info" jsonb DEFAULT '{}',
	"last_article_date" timestamp with time zone,
	"first_seen_date" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_type" "pipeline_run_type" NOT NULL,
	"status" "pipeline_run_status" NOT NULL,
	"articles_processed" integer DEFAULT 0,
	"articles_filtered" integer DEFAULT 0,
	"authors_updated" integer DEFAULT 0,
	"authors_created" integer DEFAULT 0,
	"records_cleaned" integer DEFAULT 0,
	"execution_time" integer,
	"sequence_id_start" text,
	"sequence_id_end" text,
	"error_message" text,
	"error_code" text,
	"filters_applied" jsonb DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}',
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rocketreach_api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_type" "rocketreach_api_call_type" NOT NULL,
	"endpoint" text NOT NULL,
	"parameters" jsonb DEFAULT '{}' NOT NULL,
	"response_status" integer,
	"response_time" integer,
	"records_returned" integer DEFAULT 0,
	"credits_used" integer DEFAULT 0,
	"credits_remaining" integer,
	"error_message" text,
	"error_code" text,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rocketreach_bulk_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rocketreach_request_id" text NOT NULL,
	"status" text NOT NULL,
	"lookup_count" integer NOT NULL,
	"webhook_id" text,
	"estimated_completion_time" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"results" jsonb DEFAULT '[]',
	"credits_used" integer DEFAULT 0,
	"error_message" text,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rocketreach_bulk_lookups_rocketreach_request_id_unique" UNIQUE("rocketreach_request_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rocketreach_companies" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"linkedin_url" text,
	"website" text,
	"description" text,
	"industry" text,
	"location" text,
	"city" text,
	"state" text,
	"country" text,
	"founded_year" integer,
	"employees" integer,
	"revenue" text,
	"technology_stack" jsonb DEFAULT '[]' NOT NULL,
	"social_media" jsonb DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"credits_used" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rocketreach_persons" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"middle_name" text,
	"current_employer" text,
	"current_title" text,
	"linkedin_url" text,
	"profile_pic" text,
	"location" text,
	"city" text,
	"state" text,
	"country" text,
	"emails" jsonb DEFAULT '[]' NOT NULL,
	"phones" jsonb DEFAULT '[]' NOT NULL,
	"social_media" jsonb DEFAULT '{}',
	"work_history" jsonb DEFAULT '[]' NOT NULL,
	"education" jsonb DEFAULT '[]' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"credits_used" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metabase_revoked_articles" ADD CONSTRAINT "metabase_revoked_articles_compliance_check_id_metabase_compliance_status_id_fk" FOREIGN KEY ("compliance_check_id") REFERENCES "metabase_compliance_status"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_author_articles" ADD CONSTRAINT "news_author_articles_author_id_news_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "news_authors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_author_articles" ADD CONSTRAINT "news_author_articles_article_id_metabase_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "metabase_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
