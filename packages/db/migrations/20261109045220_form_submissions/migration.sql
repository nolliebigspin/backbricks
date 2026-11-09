CREATE TYPE "form_submission_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "spam_verdict" AS ENUM('clean', 'suspect', 'spam');--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"config_version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"status" "form_submission_status" DEFAULT 'open'::"form_submission_status" NOT NULL,
	"read_at" timestamp with time zone,
	"spam_verdict" "spam_verdict" DEFAULT 'clean'::"spam_verdict" NOT NULL,
	"spam_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"subject_email" text,
	"source" jsonb DEFAULT '{}' NOT NULL,
	"search_vector" tsvector NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "form_submissions_positive_version" CHECK ("config_version" > 0),
	CONSTRAINT "form_submissions_expiry_after_creation" CHECK ("expires_at" is null or "expires_at" > "created_at"),
	CONSTRAINT "form_submissions_spam_expires" CHECK ("spam_verdict" <> 'spam' or "expires_at" is not null),
	CONSTRAINT "form_submissions_subject_normalized" CHECK ("subject_email" is null or "subject_email" = lower("subject_email"))
);
--> statement-breakpoint
CREATE INDEX "form_submissions_list_idx" ON "form_submissions" ("organization_id","project_id","instance_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "form_submissions_search_idx" ON "form_submissions" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "form_submissions_subject_idx" ON "form_submissions" ("organization_id","project_id","subject_email") WHERE "subject_email" is not null;--> statement-breakpoint
CREATE INDEX "form_submissions_expiry_idx" ON "form_submissions" ("organization_id","project_id","expires_at") WHERE "expires_at" is not null;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_aLQBhj1VUze3_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_HGrlS4CIABva_fkey" FOREIGN KEY ("organization_id","project_id","instance_id") REFERENCES "module_instances"("organization_id","project_id","id") ON DELETE CASCADE;