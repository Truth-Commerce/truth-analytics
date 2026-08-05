import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('navegação do relatório no contexto do analista', () => {
  it('leva o relatório da carteira com orgId explícito', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/analista/[orgId]/page.tsx'), 'utf8');
    expect(page).toContain('Abrir relatório completo');
    expect(page).toContain('`/dashboard/relatorios/${latestDone.id}?orgId=${orgId}`');
  });

  it('resolve a organização explícita antes de ler relatório e PDF', () => {
    const detail = readFileSync(
      join(process.cwd(), 'src/app/(client)/dashboard/relatorios/[id]/page.tsx'),
      'utf8',
    );
    const pdf = readFileSync(join(process.cwd(), 'src/app/api/reports/[id]/pdf/route.ts'), 'utf8');
    expect(detail).toContain('resolveReportOrgId');
    expect(detail).toContain('searchParams');
    expect(pdf).toContain('resolveReportOrgId');
    expect(pdf).toContain("new URL(req.url).searchParams.get('orgId')");
  });
});
