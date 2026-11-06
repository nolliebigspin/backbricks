CREATE TABLE "auth_token_replays" (
	"digest" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_token_replays_digest" CHECK ("digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "auth_token_replays_expiry_idx" ON "auth_token_replays" ("expires_at");