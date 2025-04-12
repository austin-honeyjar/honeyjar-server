DROP TABLE "csv_metadata";--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "thread_id" uuid NOT NULL;