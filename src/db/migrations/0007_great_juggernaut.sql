CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" varchar(32) NOT NULL,
	"severidade" varchar(16) DEFAULT 'atencao' NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"corpo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolvido" boolean DEFAULT false NOT NULL,
	"resolvido_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_tipo_check" CHECK ("alerts"."tipo" IN ('queda_vendas', 'concorrente_preco', 'produto_parado')),
	CONSTRAINT "alerts_severidade_check" CHECK ("alerts"."severidade" IN ('atencao', 'critico'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "geracao_automatica" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "meta_mensal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_org_abertos_idx" ON "alerts" USING btree ("org_id","resolvido","created_at");