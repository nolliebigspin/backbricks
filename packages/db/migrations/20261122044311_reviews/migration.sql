CREATE TYPE "review_moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"module_type" text DEFAULT 'reviews' NOT NULL,
	"config_version" integer NOT NULL,
	"rating" smallint NOT NULL,
	"title" text,
	"body" text,
	"author_name" text NOT NULL,
	"subject_email" text,
	"public_fields" jsonb DEFAULT '{}' NOT NULL,
	"private_fields" jsonb DEFAULT '{}' NOT NULL,
	"moderation_status" "review_moderation_status" DEFAULT 'pending'::"review_moderation_status" NOT NULL,
	"published_at" timestamp with time zone,
	"moderated_by" text,
	"moderated_at" timestamp with time zone,
	"spam_verdict" "spam_verdict" DEFAULT 'clean'::"spam_verdict" NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"source" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "reviews_module_type" CHECK ("module_type" = 'reviews'),
	CONSTRAINT "reviews_rating" CHECK ("rating" between 1 and 10),
	CONSTRAINT "reviews_positive_version" CHECK ("config_version" > 0),
	CONSTRAINT "reviews_publication" CHECK ("published_at" is null or "moderation_status" = 'approved'),
	CONSTRAINT "reviews_expiry_after_creation" CHECK ("expires_at" is null or "expires_at" > "created_at"),
	CONSTRAINT "reviews_spam_expires" CHECK ("spam_verdict" <> 'spam' or "expires_at" is not null),
	CONSTRAINT "reviews_subject_normalized" CHECK ("subject_email" is null or "subject_email" = lower("subject_email"))
);
--> statement-breakpoint
CREATE INDEX "reviews_queue_idx" ON "reviews" ("organization_id","project_id","instance_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reviews_public_newest_idx" ON "reviews" ("organization_id","project_id","instance_id","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "moderation_status" = 'approved' and "published_at" is not null and not "is_test";--> statement-breakpoint
CREATE INDEX "reviews_public_rating_asc_idx" ON "reviews" ("organization_id","project_id","instance_id","rating","published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "moderation_status" = 'approved' and "published_at" is not null and not "is_test";--> statement-breakpoint
CREATE INDEX "reviews_public_rating_desc_idx" ON "reviews" ("organization_id","project_id","instance_id","rating" DESC NULLS LAST,"published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "moderation_status" = 'approved' and "published_at" is not null and not "is_test";--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" ("organization_id","project_id","subject_email") WHERE "subject_email" is not null;--> statement-breakpoint
CREATE INDEX "reviews_expiry_idx" ON "reviews" ("organization_id","project_id","expires_at") WHERE "expires_at" is not null;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_9feraKcVaKDo_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_nZ1hmt0t5ms7_fkey" FOREIGN KEY ("organization_id","project_id","instance_id","module_type") REFERENCES "module_instances"("organization_id","project_id","id","module_type") ON DELETE RESTRICT;