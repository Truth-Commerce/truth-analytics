ALTER TABLE "connection_sync_state" DROP CONSTRAINT "connection_sync_state_org_provider_resource_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "orders_org_provider_order_uq";--> statement-breakpoint
ALTER TABLE "connection_sync_state" ADD COLUMN "source_generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_sync_state" ADD COLUMN "account_fingerprint" varchar(64);--> statement-breakpoint
UPDATE "connection_sync_state" AS css
SET "account_fingerprint" = c."provider_account_fingerprint"
FROM "connections" AS c
WHERE css."provider" = 'olist'
  AND css."account_fingerprint" IS NULL
  AND c."org_id" = css."org_id"
  AND c."provider" = css."provider"
  AND c."provider_account_fingerprint" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_sync_state" ADD COLUMN "fencing_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_sync_state" ADD CONSTRAINT "connection_sync_state_org_provider_generation_resource_uq" UNIQUE("org_id","provider","source_generation","resource");
