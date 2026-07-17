import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/kits/gerar-kits', () => ({ gerarKitsDoCiclo: vi.fn() }));
vi.mock('@/modules/pipeline/steps/nicho-ia', () => ({
  inferirNichoComIA: vi.fn(),
  gravarNichoSeVazio: vi.fn(),
}));

import { gerarKitsDoCiclo } from '@/modules/kits/gerar-kits';
import { gravarNichoSeVazio, inferirNichoComIA } from '@/modules/pipeline/steps/nicho-ia';
import { executarExtrasPosFinalize } from '@/modules/pipeline/steps/pos-finalize-extras';

const BASE = {
  orgId: 'o1',
  reportId: 'r1',
  orgName: 'Loja',
  nicho: 'cozinha' as string | null,
  ticketMedio: 80,
  topProdutos: ['A'],
};

beforeEach(() => vi.clearAllMocks());

describe('executarExtrasPosFinalize', () => {
  it('com nicho preenchido NAO infere e roda kits', async () => {
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue({ kits: 2 });
    await executarExtrasPosFinalize(BASE);
    expect(inferirNichoComIA).not.toHaveBeenCalled();
    expect(gerarKitsDoCiclo).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', nicho: 'cozinha' }),
    );
  });

  it('sem nicho infere, grava e passa o nicho novo adiante', async () => {
    vi.mocked(inferirNichoComIA).mockResolvedValue({
      nicho: 'papelaria',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, tentativas: 1 },
    });
    vi.mocked(gravarNichoSeVazio).mockResolvedValue(true);
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue(null);
    await executarExtrasPosFinalize({ ...BASE, nicho: null });
    expect(gravarNichoSeVazio).toHaveBeenCalledWith('o1', 'papelaria');
    expect(gerarKitsDoCiclo).toHaveBeenCalledWith(expect.objectContaining({ nicho: 'papelaria' }));
  });

  it('falha em um passo NAO impede o seguinte e NUNCA lança', async () => {
    vi.mocked(inferirNichoComIA).mockRejectedValue(new Error('boom'));
    vi.mocked(gerarKitsDoCiclo).mockRejectedValue(new Error('boom2'));
    await expect(executarExtrasPosFinalize({ ...BASE, nicho: null })).resolves.toBeUndefined();
    expect(gerarKitsDoCiclo).toHaveBeenCalled(); // rodou mesmo com o passo 1 explodindo
  });

  it('gerarCalendario injetado roda apos kits e falha dele tambem nao lança', async () => {
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue(null);
    const gerarCalendario = vi.fn().mockRejectedValue(new Error('boom3'));
    await expect(
      executarExtrasPosFinalize({ ...BASE, gerarCalendario }),
    ).resolves.toBeUndefined();
    expect(gerarCalendario).toHaveBeenCalled();
  });
});
