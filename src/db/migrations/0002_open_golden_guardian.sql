CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" varchar(32) DEFAULT 'bling' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expira_em" timestamp with time zone,
	"status" varchar(16) DEFAULT 'erro' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_org_provider_uq" UNIQUE("org_id","provider")
);
--> statement-breakpoint
CREATE TABLE "tracked_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" varchar(255) NOT NULL,
	"sku" varchar(120),
	"keywords" varchar(120)[] DEFAULT '{}' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD CONSTRAINT "tracked_products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_products_org_idx" ON "tracked_products" USING btree ("org_id");