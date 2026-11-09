ALTER TABLE "notification_rules" ADD COLUMN "throttle_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "throttle_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "throttle_suppressed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_throttle_counts" CHECK ("throttle_sent" >= 0 and "throttle_suppressed" >= 0);