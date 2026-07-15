import { describe, expect, it } from 'vitest';

import {
  SLA_DIAS,
  diasAtePrazo,
  diasDesde,
  labelPrazo,
  prazoDefault,
  somarDias,
  statusPrazo,
} from '@/modules/tasks/sla';
import { isTaskAtrasada } from '@/modules/tasks/task.types';

describe('somarDias', () => {
  it('soma atravessando mês e ano', () => {
    expect(somarDias('2026-07-14', 7)).toBe('2026-07-21');
    expect(somarDias('2026-07-28', 7)).toBe('2026-08-04');
    expect(somarDias('2026-12-30', 30)).toBe('2027-01-29');
  });
});

describe('prazoDefault', () => {
  it('alta=7d, media=14d, baixa=30d a partir da data dada', () => {
    expect(SLA_DIAS).toEqual({ alta: 7, media: 14, baixa: 30 });
    expect(prazoDefault('alta', '2026-07-14')).toBe('2026-07-21');
    expect(prazoDefault('media', '2026-07-14')).toBe('2026-07-28');
    expect(prazoDefault('baixa', '2026-07-14')).toBe('2026-08-13');
  });
});

describe('statusPrazo', () => {
  it('classifica sem_prazo/no_prazo/vence_em_breve/atrasada', () => {
    expect(statusPrazo(null, '2026-07-14')).toBe('sem_prazo');
    expect(statusPrazo('2026-07-13', '2026-07-14')).toBe('atrasada');
    expect(statusPrazo('2026-07-14', '2026-07-14')).toBe('vence_em_breve'); // vence hoje
    expect(statusPrazo('2026-07-16', '2026-07-14')).toBe('vence_em_breve'); // hoje+2
    expect(statusPrazo('2026-07-17', '2026-07-14')).toBe('no_prazo');
  });
});

describe('diasAtePrazo e labelPrazo', () => {
  it('conta dias com sinal', () => {
    expect(diasAtePrazo('2026-07-17', '2026-07-14')).toBe(3);
    expect(diasAtePrazo('2026-07-12', '2026-07-14')).toBe(-2);
  });

  it('rótulos pt-BR por faixa', () => {
    expect(labelPrazo(null, '2026-07-14')).toBeNull();
    expect(labelPrazo('2026-07-12', '2026-07-14')).toBe('Atrasada há 2d');
    expect(labelPrazo('2026-07-14', '2026-07-14')).toBe('Vence hoje');
    expect(labelPrazo('2026-07-15', '2026-07-14')).toBe('Vence amanhã');
    expect(labelPrazo('2026-07-17', '2026-07-14')).toBe('D-3');
    expect(labelPrazo('2026-08-20', '2026-07-14')).toBe('20/08');
  });
});

describe('isTaskAtrasada em BRT', () => {
  it('às 02:59Z ainda é o dia anterior em BRT — task com prazo de ontem UTC não está atrasada', () => {
    // 2026-07-15T02:59Z = 2026-07-14 23:59 BRT → hoje BRT = 2026-07-14
    expect(isTaskAtrasada({ prazo: '2026-07-14', status: 'todo' }, new Date('2026-07-15T02:59:00Z'))).toBe(false);
    expect(isTaskAtrasada({ prazo: '2026-07-14', status: 'todo' }, new Date('2026-07-15T03:00:00Z'))).toBe(true);
    expect(isTaskAtrasada({ prazo: '2026-07-13', status: 'concluida' }, new Date('2026-07-15T03:00:00Z'))).toBe(false);
  });
});

describe('diasDesde', () => {
  it('dias inteiros desde um instante', () => {
    const agora = new Date('2026-07-14T12:00:00Z');
    expect(diasDesde(new Date('2026-07-11T10:00:00Z'), agora)).toBe(3);
    expect(diasDesde(new Date('2026-07-14T09:00:00Z'), agora)).toBe(0);
  });
});
