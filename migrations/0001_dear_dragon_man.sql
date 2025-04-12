CREATE TABLE IF NOT EXISTS "csv_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"column_names" json NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "csv_metadata_table_name_unique" UNIQUE("table_name")
);
