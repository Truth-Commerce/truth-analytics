import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({
  env: {
    KEY_ROTATION_SECRET: 'rotation-secret-with-at-least-32-characters',
  },
}));

vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/modules/crypto/run-key-rotation', () => ({
  runKeyRotation: vi.fn(),
}));

import { POST } from '@/app/api/internal/key-rotation/route';
import { runKeyRotation } from '@/modules/crypto/run-key-rotation';

function request(secret?: string): Request {
  return new Request('https://truth-analytics.vercel.app/api/internal/key-rotation', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

describe('POST /api/internal/key-rotation', () => {
  beforeEach(() => {
    env.KEY_ROTATION_SECRET = 'rotation-secret-with-at-least-32-characters';
    vi.mocked(runKeyRotation).mockReset();
  });

  it('rejeita chamada sem o segredo e não toca nas conexões', async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(runKeyRotation).not.toHaveBeenCalled();
  });

  it('retorna indisponível quando o segredo de rotação não está configurado', async () => {
    env.KEY_ROTATION_SECRET = '';

    const response = await POST(request('rotation-secret-with-at-least-32-characters'));

    expect(response.status).toBe(503);
    expect(runKeyRotation).not.toHaveBeenCalled();
  });

  it('executa a rotação autenticada e retorna somente as contagens', async () => {
    vi.mocked(runKeyRotation).mockResolvedValue({ total: 1, atualizadas: 1, falhas: 0 });

    const response = await POST(request('rotation-secret-with-at-least-32-characters'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ total: 1, atualizadas: 1, falhas: 0 });
    expect(runKeyRotation).toHaveBeenCalledOnce();
  });

  it('impede conclusão silenciosa quando alguma conexão não pode ser decifrada', async () => {
    vi.mocked(runKeyRotation).mockResolvedValue({ total: 1, atualizadas: 0, falhas: 1 });

    const response = await POST(request('rotation-secret-with-at-least-32-characters'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ total: 1, atualizadas: 0, falhas: 1 });
  });
});
