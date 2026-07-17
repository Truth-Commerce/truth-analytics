CREATE TABLE "calendar_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'sugerido' NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_suggestions_status_check" CHECK ("calendar_suggestions"."status" IN ('sugerido', 'virou_task', 'descartado'))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "calendar_ia_usage" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_suggestions" ADD CONSTRAINT "calendar_suggestions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_suggestions" ADD CONSTRAINT "calendar_suggestions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_suggestions" ADD CONSTRAINT "calendar_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_suggestions_org_report_idx" ON "calendar_suggestions" USING btree ("org_id","report_id");--> statement-breakpoint
CREATE INDEX "calendar_suggestions_org_status_idx" ON "calendar_suggestions" USING btree ("org_id","status");