-- Coleta do Bling: itens, frete, comissao e canal real (fix da coleta incompleta).
-- Aditiva: colunas com DEFAULT e indice parcial. Nao altera nem remove nada existente.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "comissao" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "enriquecido_em" timestamp with time zone;
--> statement-breakpoint
-- Fila de enriquecimento: so as linhas ainda sem detalhe, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "orders_org_pendente_idx"
  ON "orders" ("org_id", "data")
  WHERE "enriquecido_em" IS NULL;
