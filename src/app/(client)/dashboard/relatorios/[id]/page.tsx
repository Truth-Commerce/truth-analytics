import { notFound } from 'next/navigation';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { STATUS_LABEL } from '@/modules/reports/report.types';
import { formatBRL, formatData, formatPeriodo } from '@/lib/format';

export default async function RelatorioDetalhePage({ params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);

  if (!rel) notFound();

  return (
    <main className="p-8">
      <a href="/dashboard" className="mb-4 inline-block text-sm text-blue-600 underline">
        ← Voltar ao Dashboard
      </a>

      <h1 className="mb-2 text-xl font-semibold">Relatório</h1>

      <p data-testid="report-status" className="mb-1 font-medium">
        {STATUS_LABEL[rel.status]}
      </p>
      <p className="mb-6 text-sm text-gray-600">
        {formatPeriodo(rel.periodoInicio, rel.periodoFim)}
      </p>

      {rel.status === 'done' && rel.metricas ? (
        <>
          <section data-testid="metricas" className="mb-8">
            <h2 className="mb-4 text-lg font-semibold">Métricas</h2>

            <div className="mb-4">
              <span className="font-medium">Ticket médio: </span>
              {formatBRL(rel.metricas.ticketMedio)}
            </div>

            {rel.metricas.benchmarkParcial && (
              <p className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                Benchmark de mercado parcial — dados de concorrência incompletos.
              </p>
            )}

            <div className="mb-6">
              <h3 className="mb-2 font-medium">Vendas por canal</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">Canal</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.metricas.vendasPorCanal.map((v, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{v.canal}</td>
                      <td className="p-2 text-right">{formatBRL(v.total)}</td>
                      <td className="p-2 text-right">{v.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 font-medium">Evolução</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.metricas.evolucao.map((e, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{e.data}</td>
                      <td className="p-2 text-right">{formatBRL(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 font-medium">Top produtos</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-right">Quantidade</th>
                    <th className="p-2 text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.metricas.topProdutos.map((p, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{p.nome}</td>
                      <td className="p-2">{p.sku}</td>
                      <td className="p-2 text-right">{p.quantidade}</td>
                      <td className="p-2 text-right">{formatBRL(p.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-6">
              <h3 className="mb-2 font-medium">Posição de preço</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-right">Nosso preço</th>
                    <th className="p-2 text-right">Preço mercado (mediana)</th>
                    <th className="p-2 text-left">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.metricas.posicaoPreco.map((pp, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{pp.sku}</td>
                      <td className="p-2">{pp.nome}</td>
                      <td className="p-2 text-right">{formatBRL(pp.nossoPreco)}</td>
                      <td className="p-2 text-right">{formatBRL(pp.precoMercadoMediano)}</td>
                      <td className="p-2">{pp.fonte}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {rel.analiseIa ? (
            <section className="mb-8">
              <h2 className="mb-4 text-lg font-semibold">Análise da IA</h2>

              <div className="mb-4">
                <h3 className="mb-1 font-medium">Resumo executivo</h3>
                <p data-testid="resumo-executivo">{rel.analiseIa.resumoExecutivo}</p>
              </div>

              {rel.analiseIa.gargalos.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1 font-medium">Gargalos</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {rel.analiseIa.gargalos.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rel.analiseIa.sugestoesMelhoria.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1 font-medium">Sugestões de melhoria</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {rel.analiseIa.sugestoesMelhoria.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rel.analiseIa.ideiasVenda.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1 font-medium">Ideias de venda</h3>
                  <ul className="list-disc pl-5 text-sm">
                    {rel.analiseIa.ideiasVenda.map((iv, i) => (
                      <li key={i}>{iv}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rel.analiseIa.recomendacoesPreco.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 font-medium">Recomendações de preço</h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="p-2 text-left">SKU</th>
                        <th className="p-2 text-left">Nome</th>
                        <th className="p-2 text-right">Preço sugerido</th>
                        <th className="p-2 text-left">Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rel.analiseIa.recomendacoesPreco.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{r.sku}</td>
                          <td className="p-2">{r.nome}</td>
                          <td className="p-2 text-right">{formatBRL(r.precoSugerido)}</td>
                          <td className="p-2">{r.justificativa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : rel.status === 'failed' ? (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-700">Relatório falhou.</p>
          {rel.erro ? (
            <p data-testid="report-erro" className="mt-1 text-sm text-red-600">
              {rel.erro}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-gray-600">Relatório em processamento.</p>
      )}
    </main>
  );
}
