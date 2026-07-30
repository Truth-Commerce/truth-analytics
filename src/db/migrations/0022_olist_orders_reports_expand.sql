ALTER TABLE "orders" ALTER COLUMN "bling_order_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_status" varchar(32);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source_generation" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_provider_generation_order_uq"
  ON "orders" ("org_id", "provider", "source_generation", "provider_order_id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "enrichment_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "enrichment_last_attempt_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "enrichment_last_error_code" varchar(64);
--> statement-breakpoint
CREATE INDEX "orders_org_provider_data_idx" ON "orders" ("org_id", "provider", "data");
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source_provider" varchar(32);
--> statement-breakpoint
UPDATE "reports" SET "source_provider" = 'bling' WHERE "source_provider" IS NULL;
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source_generation" integer;
--> statement-breakpoint
UPDATE "reports" SET "source_generation" = 1 WHERE "source_generation" IS NULL;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "provider_account_fingerprint" varchar(64);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "data_generation" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "provider_rate_limit_state" (
  "provider" varchar(32) NOT NULL,
  "account_fingerprint" varchar(64) NOT NULL,
  "next_request_at" timestamp with time zone,
  "window_started_at" timestamp with time zone,
  "requests_in_window" integer DEFAULT 0 NOT NULL,
  "consecutive_high_priority" integer DEFAULT 0 NOT NULL,
  "observed_limit" integer,
  "observed_remaining" integer,
  "observed_reset_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "provider_rate_limit_state_provider_account_uq" UNIQUE("provider", "account_fingerprint")
);
