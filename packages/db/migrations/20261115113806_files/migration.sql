CREATE TYPE "file_status" AS ENUM('pending', 'uploaded', 'scanning', 'ready', 'quarantined', 'rejected');--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"module_type" text DEFAULT 'uploads' NOT NULL,
	"config_version" integer NOT NULL,
	"status" "file_status" DEFAULT 'pending'::"file_status" NOT NULL,
	"staging_key" text NOT NULL UNIQUE,
	"storage_key" text NOT NULL UNIQUE,
	"original_name" text NOT NULL,
	"declared_mime" text NOT NULL,
	"detected_mime" text,
	"size_bytes" bigint NOT NULL,
	"sha256" bytea,
	"scan" jsonb,
	"scan_attempts" integer DEFAULT 0 NOT NULL,
	"upload_token_hash" bytea NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"copied_at" timestamp with time zone,
	"staging_cleaned_at" timestamp with time zone,
	"owner_type" text,
	"owner_id" text,
	"subject_email" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"cleanup_after" timestamp with time zone,
	"cleanup_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "files_uploads_parent" CHECK ("module_type" = 'uploads'),
	CONSTRAINT "files_positive_version" CHECK ("config_version" > 0),
	CONSTRAINT "files_size_bounds" CHECK ("size_bytes" between 1 and 104857600),
	CONSTRAINT "files_name_bounds" CHECK (char_length("original_name") between 1 and 255),
	CONSTRAINT "files_token_hash_length" CHECK (octet_length("upload_token_hash") = 32),
	CONSTRAINT "files_sha256_length" CHECK ("sha256" is null or octet_length("sha256") = 32),
	CONSTRAINT "files_staging_identity" CHECK ("staging_key" = 'stg/' || "organization_id" || '/' || "project_id" || '/' || "id"),
	CONSTRAINT "files_final_identity" CHECK ("storage_key" = 'fil/' || "organization_id" || '/' || "project_id" || '/' || "id"),
	CONSTRAINT "files_owner_pair" CHECK (("owner_type" is null and "owner_id" is null) or (length("owner_type") > 0 and length("owner_id") > 0)),
	CONSTRAINT "files_subject_normalized" CHECK ("subject_email" is null or "subject_email" = lower("subject_email")),
	CONSTRAINT "files_expiry_after_creation" CHECK ("expires_at" is null or "expires_at" > "created_at"),
	CONSTRAINT "files_unclaimed_expires" CHECK ("owner_id" is not null or "expires_at" is not null),
	CONSTRAINT "files_put_expiry" CHECK ("upload_expires_at" > "created_at"),
	CONSTRAINT "files_json_objects" CHECK (jsonb_typeof("metadata") = 'object' and ("scan" is null or jsonb_typeof("scan") = 'object')),
	CONSTRAINT "files_attempts_nonnegative" CHECK ("scan_attempts" >= 0 and "cleanup_attempts" >= 0),
	CONSTRAINT "files_deletion_cleanup" CHECK ("deleted_at" is null or ("cleanup_after" is not null and "deleted_at" >= "created_at")),
	CONSTRAINT "files_uploaded_state" CHECK ("status" not in ('uploaded', 'scanning', 'ready', 'quarantined') or "uploaded_at" is not null),
	CONSTRAINT "files_ready_inspected" CHECK ("status" <> 'ready' or ("detected_mime" is not null and "sha256" is not null and "scan" is not null))
);
--> statement-breakpoint
ALTER TABLE "module_instances" ADD CONSTRAINT "module_instances_organization_id_project_id_id_module_type_unique" UNIQUE("organization_id","project_id","id","module_type");--> statement-breakpoint
CREATE INDEX "files_list_idx" ON "files" ("organization_id","project_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "files_zone_idx" ON "files" ("organization_id","project_id","instance_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "files_status_idx" ON "files" ("organization_id","project_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" ("organization_id","project_id","owner_type","owner_id") WHERE "owner_id" is not null;--> statement-breakpoint
CREATE INDEX "files_orphan_idx" ON "files" ("organization_id","project_id","created_at","id") WHERE "owner_id" is null;--> statement-breakpoint
CREATE INDEX "files_expiry_idx" ON "files" ("organization_id","project_id","expires_at","id") WHERE "expires_at" is not null;--> statement-breakpoint
CREATE INDEX "files_cleanup_idx" ON "files" ("organization_id","project_id","cleanup_after","id") WHERE "deleted_at" is not null;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_Z4JbyiOWvsHO_fkey" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_n1PyKkTclozn_fkey" FOREIGN KEY ("organization_id","project_id","instance_id","module_type") REFERENCES "module_instances"("organization_id","project_id","id","module_type") ON DELETE CASCADE;