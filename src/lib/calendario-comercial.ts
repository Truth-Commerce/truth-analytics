/**
 * Calendário comercial brasileiro — datas fixas + regras móveis, tudo puro
 * (datas em UTC-midnight, sem I/O). Usado para injetar contexto sazonal no
 * prompt da análise IA (só datas a ≤N dias do fim do período).
 */

export type DataComercial = { nome: string; data: Date; dica: string };

const DIA_MS = 86_400_000;

function utc(ano: number, mesIdx: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesIdx, dia));
}

/** Computus (algoritmo gregoriano anônimo/Meeus) — domingo de Páscoa. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes - 1, dia);
}

function nEsimoDomingo(ano: number, mesIdx: number, n: number): Date {
  const primeiro = utc(ano, mesIdx, 1);
  const offset = (7 - primeiro.getUTCDay()) % 7;
  return utc(ano, mesIdx, 1 + offset + (n - 1) * 7);
}

function ultimaSexta(ano: number, mesIdx: number): Date {
  const ultimo = new Date(Date.UTC(ano, mesIdx + 1, 0));
  const offset = (ultimo.getUTCDay() - 5 + 7) % 7;
  return utc(ano, mesIdx, ultimo.getUTCDate() - offset);
}

export function datasComerciaisDoAno(ano: number): DataComercial[] {
  const pascoaData = pascoa(ano);
  const carnaval = new Date(pascoaData.getTime() - 47 * DIA_MS);
  const blackFriday = ultimaSexta(ano, 10);
  const cyberMonday = new Date(blackFriday.getTime() + 3 * DIA_MS);
  return [
    { nome: 'Ano Novo', data: utc(ano, 0, 1), dica: 'Queima de estoque e listas de "recomeço" (organização, fitness, papelaria).' },
    { nome: 'Volta às aulas', data: utc(ano, 0, 15), dica: 'Pico de material escolar, mochilas, eletrônicos de estudo.' },
    { nome: 'Carnaval', data: carnaval, dica: 'Fantasias, glitter, caixas térmicas; logística mais lenta na semana.' },
    { nome: 'Dia da Mulher', data: utc(ano, 2, 8), dica: 'Presentes de ticket baixo/médio: beleza, acessórios, canecas.' },
    { nome: 'Dia do Consumidor', data: utc(ano, 2, 15), dica: '"Black Friday do 1º semestre" — cupons e frete grátis convertem bem.' },
    { nome: 'Páscoa', data: pascoaData, dica: 'Chocolates, cestas e utilidades de cozinha; anuncie 3 semanas antes.' },
    { nome: 'Dia das Mães', data: nEsimoDomingo(ano, 4, 2), dica: 'Segunda maior data do e-commerce BR — kits presenteáveis e embalagem.' },
    { nome: 'Dia dos Namorados', data: utc(ano, 5, 12), dica: 'Presentes até R$ 150 dominam; combos "para o casal".' },
    { nome: 'Volta às aulas (2º semestre)', data: utc(ano, 6, 15), dica: 'Reposição de material escolar e informática.' },
    { nome: 'Dia dos Pais', data: nEsimoDomingo(ano, 7, 2), dica: 'Ferramentas, churrasco, eletrônicos; kits com cartão.' },
    { nome: 'Dia do Cliente', data: utc(ano, 8, 15), dica: 'Data de recompra: cupom para quem já comprou.' },
    { nome: 'Dia das Crianças', data: utc(ano, 9, 12), dica: 'Brinquedos e games; frete rápido decide a compra na última semana.' },
    { nome: 'Black Friday', data: blackFriday, dica: 'Maior data do ano — prepare estoque e preço 30 dias antes; evite "metade do dobro".' },
    { nome: 'Cyber Monday', data: cyberMonday, dica: 'Extensão da Black Friday para eletrônicos e itens parados.' },
    { nome: 'Natal', data: utc(ano, 11, 25), dica: 'Corte de frete: últimos pedidos ~10 dias antes; kits presente.' },
  ];
}

/** Datas comerciais dentro de [aPartirDe, aPartirDe + dias], ordenadas asc. */
export function proximasDatas(aPartirDe: Date, dias: number): DataComercial[] {
  const fimJanela = aPartirDe.getTime() + dias * DIA_MS;
  const ano = aPartirDe.getUTCFullYear();
  return [...datasComerciaisDoAno(ano), ...datasComerciaisDoAno(ano + 1)]
    .filter((d) => d.data.getTime() >= aPartirDe.getTime() && d.data.getTime() <= fimJanela)
    .sort((a, b) => a.data.getTime() - b.data.getTime());
}
