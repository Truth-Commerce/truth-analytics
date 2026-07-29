CREATE TABLE "provider_rate_limit_waiters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"account_fingerprint" varchar(64) NOT NULL,
	"priority" varchar(16) NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"granted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "provider_rate_limit_waiters_queue_idx" ON "provider_rate_limit_waiters" USING btree ("provider","account_fingerprint","priority","enqueued_at","id");