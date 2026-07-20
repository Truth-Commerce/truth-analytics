CREATE TABLE "analyst_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_heartbeats" (
	"rota" varchar(64) PRIMARY KEY NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "briefing_ia_usage" jsonb;--> statement-breakpoint
ALTER TABLE "analyst_briefings" ADD CONSTRAINT "analyst_briefings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_briefings" ADD CONSTRAINT "analyst_briefings_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyst_briefings_org_created_idx" ON "analyst_briefings" USING btree ("org_id","created_at");