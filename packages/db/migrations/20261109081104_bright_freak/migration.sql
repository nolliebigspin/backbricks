ALTER TABLE "notification_rules" RENAME COLUMN "recipients" TO "recipient_user_ids";--> statement-breakpoint
-- Pre-API rules stored copied email addresses, which must not be interpreted as member IDs.
UPDATE "notification_rules" SET "recipient_user_ids" = '{}'::text[], "enabled" = false;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "max_per_hour" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_rules_event_idx" ON "notification_rules" ("organization_id","project_id","event_type");--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_recipient_bound" CHECK (cardinality("recipient_user_ids") <= 20);--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_enabled_recipients" CHECK (not "enabled" or cardinality("recipient_user_ids") > 0);--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_hourly_bound" CHECK ("max_per_hour" between 1 and 100);