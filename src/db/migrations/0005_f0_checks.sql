ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK (status IN ('queued','running','done','failed'));
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_etapa_check" CHECK (etapa IS NULL OR etapa IN ('coletando_vendas','analisando_mercado','analisando_ia','finalizando'));
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check" CHECK (status IN ('pending','active','suspended'));
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plano_check" CHECK (plano IS NULL OR plano IN ('weekly','biweekly','monthly'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('admin_truth','client','analista'));
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_status_check" CHECK (status IN ('ok','expirado','erro'));
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_fonte_check" CHECK (fonte IN ('ml_publico','serpapi'));
--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_escopo_check" CHECK (escopo IN ('login','signup','reset'));
