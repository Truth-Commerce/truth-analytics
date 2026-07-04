import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { generateReport } from '@/modules/pipeline/orchestrator';

export const dynamic = 'force-dynamic';
// Exige plano Vercel com suporte a 300s (validado nos pré-requisitos).
export const maxDuration = 300;

const bodySchema = z.object({ reportId: z.string().uuid() });

export async function POST(req: Request): Promise<NextResponse> {
  if (!serverEnv.PIPELINE_SECRET) {
    return NextResponse.json({ error: 'pipeline_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('x-pipeline-secret'), serverEnv.PIPELINE_SECRET)) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 });
  }

  const { reportId } = parsed.data;
  waitUntil(
    generateReport(reportId).catch((err) => {
      logger.error('pipeline em background falhou fora do orquestrador', { reportId }, err);
    }),
  );
  return NextResponse.json({ accepted: true, reportId }, { status: 202 });
}
