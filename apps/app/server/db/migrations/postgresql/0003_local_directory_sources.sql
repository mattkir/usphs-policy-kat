ALTER TABLE "sources" ADD COLUMN "directory_path" text;
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"source_id" text NOT NULL,
	"relative_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot_path" text NOT NULL,
	"kind" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_source_id_relative_path_pk" PRIMARY KEY("source_id","relative_path")
);
--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "source_documents_source_id_idx" ON "source_documents" USING btree ("source_id");
