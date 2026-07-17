CREATE TABLE "kit_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'sugerido' NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_suggestions_status_check" CHECK ("kit_suggestions"."status" IN ('sugerido', 'virou_task', 'descartado'))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "kits_ia_usage" jsonb;--> statement-breakpoint
ALTER TABLE "kit_suggestions" ADD CONSTRAINT "kit_suggestions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_suggestions" ADD CONSTRAINT "kit_suggestions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_suggestions" ADD CONSTRAINT "kit_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kit_suggestions_org_report_idx" ON "kit_suggestions" USING btree ("org_id","report_id");--> statement-breakpoint
CREATE INDEX "kit_suggestions_org_status_idx" ON "kit_suggestions" USING btree ("org_id","status");