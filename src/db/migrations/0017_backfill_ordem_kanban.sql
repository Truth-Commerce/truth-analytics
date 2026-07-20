-- Custom SQL migration file, put your code below!
-- F3 (revisão H5/T11, fix pós-revisão adicional): `ordenarColuna` passou a
-- ordenar por `ordem` PRIMEIRO (chave manual — necessário pra drag/reorder
-- serem reais). Mas `ordem` já era distinta e crescente por (org_id, status)
-- pra TODA task existente (atribuída em createTask/moveTask como
-- `MAX(ordem)+1` — ordem de chegada), então os tie-breakers antigos
-- (prioridade -> prazo) nunca mais são alcançados em produção: o board de
-- qualquer cliente que nunca arrastou nada muda de "prioridade alta no topo"
-- pra "ordem de chegada" no exato momento do deploy.
--
-- Fix: backfill de `ordem`, por (org_id, status), seguindo a ordenação ANTIGA
-- (prioridade alta->media->baixa, depois prazo asc com null por último,
-- depois ordem/created_at como desempate final), atribuindo valores
-- sequenciais 1..N via ROW_NUMBER(). Depois deste backfill, a ordenação
-- `ordem`-primeiro reproduz EXATAMENTE a ordem visual de hoje — qualquer
-- drag/reorder posterior passa a ter precedência (o objetivo do fix
-- original), sem quebrar o board de nenhum cliente existente no cutover.
UPDATE "tasks" t
SET "ordem" = sub.nova_ordem::integer
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, status
      ORDER BY
        CASE prioridade
          WHEN 'alta' THEN 0
          WHEN 'media' THEN 1
          WHEN 'baixa' THEN 2
          ELSE 3
        END ASC,
        prazo ASC NULLS LAST,
        ordem ASC,
        created_at ASC
    ) AS nova_ordem
  FROM "tasks"
) sub
WHERE t.id = sub.id;
 --