CREATE TYPE "actor_type" AS ENUM('user', 'api_key', 'mcp', 'system');--> statement-breakpoint
CREATE TYPE "api_key_kind" AS ENUM('publishable', 'secret');--> statement-breakpoint
CREATE TYPE "module_instance_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "notification_channel" AS ENUM('email');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" "api_key_kind" NOT NULL,
	"name" text NOT NULL,
	"lookup_hash" bytea NOT NULL UNIQUE,
	"display_prefix" text NOT NULL,
	"public_token" text UNIQUE,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_keys_public_token_kind" CHECK (("kind" = 'publishable') = ("public_token" is not null)),
	CONSTRAINT "api_keys_hash_length" CHECK (octet_length("lookup_hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_organization_id_slug_unique" UNIQUE("organization_id","slug"),
	CONSTRAINT "projects_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"changes" jsonb,
	"ip_hash" bytea,
	"request_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_logs_expiry_after_creation" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"instance_id" text,
	"event_type" text NOT NULL,
	"channel" "notification_channel" DEFAULT 'email'::"notification_channel" NOT NULL,
	"recipients" text[] NOT NULL,
	"include_content" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"organization_id" text,
	"project_id" text,
	"metric" text,
	"period" date,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_pkey" PRIMARY KEY("organization_id","project_id","metric","period"),
	CONSTRAINT "usage_counters_nonnegative" CHECK ("value" >= 0),
	CONSTRAINT "usage_counters_month_start" CHECK (extract(day from "period") = 1)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"organization_id" text,
	"project_id" text,
	"key" text,
	"request_hash" bytea NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("organization_id","project_id","key"),
	CONSTRAINT "idempotency_keys_hash_length" CHECK (octet_length("request_hash") = 32),
	CONSTRAINT "idempotency_keys_response_status" CHECK ("response_status" between 200 and 299),
	CONSTRAINT "idempotency_keys_expiry_after_creation" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "pow_challenges_used" (
	"signature" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket" text PRIMARY KEY,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_positive_count" CHECK ("count" > 0)
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_instance_revisions" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"config_version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"module_version" integer NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "module_instance_revisions_instance_id_config_version_unique" UNIQUE("instance_id","config_version"),
	CONSTRAINT "module_instance_revisions_positive_versions" CHECK ("config_version" > 0 and "module_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "module_instances" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"module_type" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" "module_instance_status" DEFAULT 'active'::"module_instance_status" NOT NULL,
	"config" jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"module_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "module_instances_organization_id_project_id_id_unique" UNIQUE("organization_id","project_id","id"),
	CONSTRAINT "module_instances_project_id_module_type_key_unique" UNIQUE("project_id","module_type","key"),
	CONSTRAINT "module_instances_key_format" CHECK ("key" ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
	CONSTRAINT "module_instances_positive_versions" CHECK ("config_version" > 0 and "module_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "api_keys_project_idx" ON "api_keys" ("organization_id","project_id") WHERE "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_expiry_idx" ON "audit_logs" ("expires_at");--> statement-breakpoint
CREATE INDEX "events_pending_idx" ON "events" ("created_at") WHERE "dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "events_expiry_idx" ON "events" ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "idempotency_keys" ("expires_at");--> statement-breakpoint
CREATE INDEX "pow_challenges_used_expiry_idx" ON "pow_challenges_used" ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expiry_idx" ON "rate_limit_buckets" ("expires_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_U1lebvPh0yOW_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_d2CSk5y8VmlE_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_6QVESfodRybs_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_gS0CGwZEoFvB_fkey" FOREIGN KEY ("organization_id","project_id","instance_id") REFERENCES "module_instances"("organization_id","project_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_OzaoCro68MoY_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_Fb8qZCPYOjnf_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "module_instance_revisions" ADD CONSTRAINT "module_instance_revisions_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "module_instance_revisions" ADD CONSTRAINT "module_instance_revisions_kAdU5JCUDTDq_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "module_instance_revisions" ADD CONSTRAINT "module_instance_revisions_5BcX9RIKI0Ct_fkey" FOREIGN KEY ("organization_id","project_id","instance_id") REFERENCES "module_instances"("organization_id","project_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "module_instances" ADD CONSTRAINT "module_instances_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "module_instances" ADD CONSTRAINT "module_instances_xtjifZsFfMng_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;