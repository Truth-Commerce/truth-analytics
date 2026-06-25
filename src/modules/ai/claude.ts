import Anthropic from '@anthropic-ai/sdk';
import { serverEnv } from '@/lib/env';

let _client: Anthropic | null = null;

/**
 * Lazy singleton do cliente Anthropic.
 * Não instancia em tempo de módulo — permite o app bootar sem a chave.
 * Exportado como função para que testes possam vi.spyOn / substituir.
 */
export function getAnthropic(): Anthropic {
  if (_client) return _client;

  const apiKey = serverEnv.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ia_nao_configurada');
  }

  _client = new Anthropic({ apiKey });
  return _client;
}
