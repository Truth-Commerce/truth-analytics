CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" varchar(120) NOT NULL,
	"inicio" date,
	"fim" date,
	"status" varchar(12) DEFAULT 'planejado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_status_check" CHECK ("cycles"."status" IN ('planejado', 'ativo', 'fechado'))
);
--> statement-breakpoint
CREATE TABLE "task_watchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "nivel" varchar(10) DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cycles_org_status_idx" ON "cycles" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "task_watchers_task_user_unique" ON "task_watchers" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "task_watchers_task_idx" ON "task_watchers" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_cycle_idx" ON "tasks" USING btree ("cycle_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_nivel_check" CHECK ("tasks"."nivel" IN ('epico', 'task', 'subtask'));