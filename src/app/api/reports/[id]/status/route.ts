import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { getSessionContext } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/**
 * Status de um relatório para polling do client (stepper da F1, a cada 3s
 * enquanto status ∈ {queued, running}). SEMPRE escopado pela org da sessão —
 * nunca confia no id isoladamente (sem IDOR).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const access = await getSessionContext();
  if (!access) {
    return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });
  }

  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 });
  }

  const [row] = await db
    .select({ status: reports.status, etapa: reports.etapa })
    .from(reports)
    .where(and(eq(reports.id, parsed.data), eq(reports.org_id, access.orgId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 });
  }

  return NextResponse.json(
    { status: row.status, etapa: row.etapa },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
