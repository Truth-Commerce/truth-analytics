ALTER TABLE "task_templates" ADD COLUMN "prioridade" varchar(8) DEFAULT 'media' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "prazo_dias" integer;