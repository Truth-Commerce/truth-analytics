UPDATE alerts a
SET resolvido = true, resolvido_em = now()
WHERE a.resolvido = false
  AND EXISTS (
    SELECT 1 FROM alerts b
    WHERE b.org_id = a.org_id
      AND b.tipo = a.tipo
      AND b.dados->>'chave_dedup' = a.dados->>'chave_dedup'
      AND b.resolvido = false
      AND (b.created_at > a.created_at OR (b.created_at = a.created_at AND b.id > a.id))
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_org_tipo_dedup_aberto_uq" ON "alerts" USING btree ("org_id","tipo",("dados"->>'chave_dedup')) WHERE "alerts"."resolvido" = false;