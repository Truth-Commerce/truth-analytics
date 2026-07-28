-- Fundação multi-ERP aditiva: preserva os contratos e identificadores legados do Bling.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider" varchar(32);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider_order_id" varchar(64);
--> statement-breakpoint
UPDATE "orders"
SET "provider" = 'bling', "provider_order_id" = "bling_order_id"
WHERE "provider" IS NULL OR "provider_order_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "provider" SET DEFAULT 'bling';
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "provider" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "provider_order_id" SET NOT NULL;
--> statement-breakpoint
-- Mantém os escritores legados, que só informam bling_order_id, compatíveis nesta fase.
ALTER TABLE "orders" ALTER COLUMN "provider_order_id" SET DEFAULT '';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "orders_fill_legacy_provider_id"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_order_id = '' THEN
    NEW.provider_order_id := NEW.bling_order_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "orders_fill_legacy_provider_id_trigger" ON "orders";
--> statement-breakpoint
CREATE TRIGGER "orders_fill_legacy_provider_id_trigger"
BEFORE INSERT ON "orders"
FOR EACH ROW EXECUTE FUNCTION "orders_fill_legacy_provider_id"();
--> statement-breakpoint

ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "oauth_client_id" text;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "oauth_client_secret" text;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "refresh_expira_em" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "last_refresh_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "last_error_code" varchar(64);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "last_error_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connections_org_erp_ok_uq"
  ON "connections" ("org_id")
  WHERE "status" = 'ok';
--> statement-breakpoint

ALTER TABLE "product_stock" ADD COLUMN IF NOT EXISTS "provider" varchar(32);
--> statement-breakpoint
ALTER TABLE "product_stock" ADD COLUMN IF NOT EXISTS "provider_product_id" varchar(64);
--> statement-breakpoint
UPDATE "product_stock" SET "provider" = 'bling' WHERE "provider" IS NULL;
--> statement-breakpoint
ALTER TABLE "product_stock" ALTER COLUMN "provider" SET DEFAULT 'bling';
--> statement-breakpoint
ALTER TABLE "product_stock" ALTER COLUMN "provider" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_org_provider_order_uq"
  ON "orders" ("org_id", "provider", "provider_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_stock_org_provider_sku_uq"
  ON "product_stock" ("org_id", "provider", "sku");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "connection_sync_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider" varchar(32) NOT NULL,
  "resource" varchar(64) NOT NULL,
  "cursor" jsonb,
  "run_id" uuid,
  "lease_token" varchar(128),
  "lease_expires_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "succeeded_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "processed_count" integer DEFAULT 0 NOT NULL,
  "backlog_count" integer,
  "last_error_code" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "connection_sync_state_org_provider_resource_uq" UNIQUE("org_id", "provider", "resource")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_sync_state_lease_expires_idx"
  ON "connection_sync_state" ("lease_expires_at");
