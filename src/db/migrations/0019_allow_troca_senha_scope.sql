ALTER TABLE "login_attempts" DROP CONSTRAINT IF EXISTS "login_attempts_escopo_check";
--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_escopo_check"
  CHECK (escopo IN ('login','signup','reset','troca_senha'));
