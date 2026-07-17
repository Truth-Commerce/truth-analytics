import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { proximasDatas } from '@/lib/calendario-comercial';
import { formatDataCurta } from '@/lib/format';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  agruparPorData,
  badgeContagem,
  sugestaoView,
} from '@/modules/calendario/calendario-view-model';
import { listSugestoesUltimoCiclo } from '@/modules/calendario/calendario.repository';
import { JANELA_CALENDARIO_DIAS } from '@/modules/calendario/gerar-calendario';

import { CalendarioActions } from './calendario-actions';

export const metadata: Metadata = { title: 'Calendário comercial' };

export default async function CalendarioPage() {
  const access = await requireActiveOrg();
  const hoje = new Date();
  const datas = proximasDatas(hoje, JANELA_CALENDARIO_DIAS);
  const sugestoes = (await listSugestoesUltimoCiclo(access.orgId)).map(sugestaoView);
  const timeline = agruparPorData(sugestoes, datas, hoje);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oportunidade"
        title="Calendário comercial"
        description="As próximas datas sazonais do e-commerce brasileiro, com sugestões da IA a partir do que sua loja já vende."
      />

      {timeline.length === 0 ? (
        <EmptyState
          title="Nenhuma data comercial nos próximos 90 dias"
          description="Isso não deveria acontecer — confira o calendário comercial."
        />
      ) : (
        <div className="space-y-4" data-testid="calendario-timeline">
          {timeline.map((t) => {
            const badge = badgeContagem(t.faltamDias);
            return (
              <Card key={t.dataISO} data-testid="calendario-data">
                <CardHeader>
                  <CardTitle>
                    {t.nome} <span className="font-mono text-xs text-muted">{formatDataCurta(t.dataISO)}</span>
                  </CardTitle>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted">{t.dica}</p>
                  {t.sugestoes.length > 0 ? (
                    <div className="space-y-3">
                      {t.sugestoes.map((s) => (
                        <div key={s.id} className="space-y-2 rounded-xl border border-line p-4">
                          <p className="font-heading text-sm font-semibold text-white">{s.titulo}</p>
                          <p className="text-sm">{s.sugestao}</p>
                          {s.skus.length > 0 ? (
                            <p className="font-mono text-xs text-muted">{s.skus.join(', ')}</p>
                          ) : null}
                          <CalendarioActions sugestaoId={s.id} status={s.status} titulo={s.titulo} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
