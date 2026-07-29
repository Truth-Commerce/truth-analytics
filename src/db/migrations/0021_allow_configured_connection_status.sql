ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_status_check";
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_status_check" CHECK (status IN ('ok','expirado','erro','configurado'));
