ALTER TABLE "product_stock" ADD COLUMN "source_generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_stock" ADD COLUMN "fencing_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "product_stock_org_provider_generation_updated_idx" ON "product_stock" USING btree ("org_id","provider","source_generation","updated_at");--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_org_provider_generation_sku_uq" UNIQUE("org_id","provider","source_generation","sku");