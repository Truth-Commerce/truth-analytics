CREATE TABLE "product_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"saldo" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_stock_org_sku_uq" UNIQUE("org_id","sku")
);
--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_tipo_check";--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_stock_org_idx" ON "product_stock" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tipo_check" CHECK ("alerts"."tipo" IN ('queda_vendas', 'concorrente_preco', 'produto_parado', 'estoque_critico'));