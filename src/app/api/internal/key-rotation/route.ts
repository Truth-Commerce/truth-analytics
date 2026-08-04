import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { runKeyRotation } from '@/modules/crypto/run-key-rotation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  if (!serverEnv.KEY_ROTATION_SECRET) {
    return NextResponse.json({ error: 'rotacao_nao_configurada' }, { status: 503 });
  }

  if (
    !secretsMatch(
      request.headers.get('authorization'),
      `Bearer ${serverEnv.KEY_ROTATION_SECRET}`,
    )
  ) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const result = await runKeyRotation();
    return NextResponse.json(result, {
      status: result.falhas === 0 ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error('key_rotation.failed', {}, error);
    return NextResponse.json(
      { error: 'rotacao_falhou' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
