import { db } from '@/db/client';
import { auditLog } from '@/db/schema';

export async function recordAudit(input: {
  orgId?: string | null;
  userId?: string | null;
  acao: string;
  detalhes?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    org_id: input.orgId ?? null,
    user_id: input.userId ?? null,
    acao: input.acao,
    detalhes: (input.detalhes ?? null) as Record<string, unknown> | null,
  });
}
