import type { Metadata } from 'next';
import Link from 'next/link';

import { H2, P, UL } from '../tipografia';

export const metadata: Metadata = {
  title: 'Termos de Uso — Truth Analytics',
  description: 'Condições de uso da plataforma Truth Analytics (Truth Commerce).',
};

export default function TermosPage() {
  return (
    <article>
      <h1 className="text-balance font-heading text-4xl text-ink sm:text-5xl">Termos de Uso</h1>
      <p className="mt-2 text-xs text-dim">Última atualização: 14 de julho de 2026.</p>

      <H2>1. Quem somos e aceitação</H2>
      <P>
        O Truth Analytics é uma plataforma de inteligência de vendas para e-commerce operada pela
        Truth Commerce (&quot;nós&quot;), acessível em truthcommerce.com.br. Ao criar uma conta,
        marcar a caixa de aceite no cadastro ou usar a plataforma, você (&quot;cliente&quot;)
        concorda integralmente com estes Termos de Uso e com a nossa{' '}
        <Link href="/privacidade" className="text-brand hover:underline">
          Política de Privacidade
        </Link>
        . Se você aceita em nome de uma empresa, declara ter poderes para vinculá-la.
      </P>

      <H2>2. O serviço</H2>
      <P>
        O Truth Analytics conecta-se ao seu sistema de gestão (ERP Bling) mediante a sua
        autorização e, a partir dos seus dados de pedidos e de dados públicos de mercado, gera
        periodicamente relatórios de análise com métricas consolidadas, comparativos de preço,
        alertas e recomendações produzidas com apoio de inteligência artificial, além de um plano
        de ação acompanhado por analistas da Truth Commerce.
      </P>

      <H2>3. Conta, credenciais e usuários adicionais</H2>
      <UL>
        <li>Você é responsável por manter a confidencialidade das suas credenciais.</li>
        <li>
          Usuários adicionais da sua organização são criados pela equipe Truth mediante sua
          solicitação e recebem senha temporária, que deve ser trocada no primeiro acesso em
          Configurações.
        </li>
        <li>
          Avise-nos imediatamente (suporte@truthcommerce.com.br) sobre qualquer uso não autorizado
          da sua conta.
        </li>
      </UL>

      <H2>4. Conexão com o ERP</H2>
      <P>
        A conexão com o Bling é feita via OAuth, autorizada por você e revogável a qualquer momento
        na página Conexões da plataforma ou no painel do próprio Bling. Os tokens de acesso são
        armazenados cifrados. Nós lemos apenas os dados de pedidos necessários para gerar as
        análises (canal de venda, data, valores, frete e itens) — não alteramos dados no seu ERP.
      </P>

      <H2>5. Planos, limites e disponibilidade</H2>
      <UL>
        <li>
          Os planos (Semanal, Quinzenal e Mensal) definem a cadência dos relatórios e o limite de
          produtos monitorados.
        </li>
        <li>
          A plataforma é fornecida em regime de melhor esforço; manutenções e indisponibilidades
          pontuais podem ocorrer.
        </li>
        <li>
          Condições comerciais (preço, forma de pagamento, reajuste) são acordadas em proposta ou
          contrato à parte.
        </li>
      </UL>

      <H2>6. Natureza das análises</H2>
      <P>
        As análises, alertas e recomendações são geradas por software, incluindo modelos de
        inteligência artificial, a partir dos dados disponíveis no período analisado. Elas são um
        apoio à decisão do gestor — não constituem promessa de resultado, aconselhamento
        financeiro, contábil ou de investimento, e dependem da qualidade e completude dos dados do
        seu ERP e das fontes públicas de mercado. A decisão comercial é sempre sua.
      </P>

      <H2>7. Obrigações do cliente</H2>
      <UL>
        <li>Usar a plataforma de forma lícita e apenas com dados sobre os quais tem legitimidade.</li>
        <li>Não tentar acessar dados de outras organizações, burlar limites ou realizar engenharia reversa.</li>
        <li>Manter seus dados cadastrais atualizados.</li>
      </UL>

      <H2>8. Propriedade intelectual</H2>
      <P>
        A plataforma, sua marca, código e layout pertencem à Truth Commerce. Os dados de vendas
        importados do seu ERP permanecem seus; você nos concede licença de processamento desses
        dados exclusivamente para a prestação do serviço, nos termos da Política de Privacidade. Os
        relatórios gerados para a sua organização podem ser usados livremente por você.
      </P>

      <H2>9. Privacidade e proteção de dados</H2>
      <P>
        O tratamento de dados pessoais segue a nossa{' '}
        <Link href="/privacidade" className="text-brand hover:underline">
          Política de Privacidade
        </Link>{' '}
        e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </P>

      <H2>10. Suspensão e encerramento</H2>
      <UL>
        <li>
          Podemos suspender contas por violação destes Termos, uso abusivo ou inadimplência,
          mediante aviso quando possível.
        </li>
        <li>
          Você pode encerrar sua conta a qualquer momento solicitando a
          suporte@truthcommerce.com.br. Após o encerramento, seus dados são excluídos conforme a
          seção de retenção da Política de Privacidade (em até 30 dias).
        </li>
      </UL>

      <H2>11. Limitação de responsabilidade</H2>
      <P>
        Na máxima extensão permitida em lei, a Truth Commerce não responde por lucros cessantes,
        perda de receita ou danos indiretos decorrentes do uso ou da indisponibilidade da
        plataforma, nem por decisões comerciais tomadas com base nas análises. Nada nestes Termos
        exclui responsabilidades que não possam ser excluídas por lei.
      </P>

      <H2>12. Alterações, lei aplicável e foro</H2>
      <P>
        Podemos atualizar estes Termos; mudanças relevantes serão comunicadas na plataforma ou por
        e-mail, e a data de &quot;última atualização&quot; acima será revisada. Estes Termos são
        regidos pelas leis da República Federativa do Brasil, ficando eleito o foro da comarca da
        sede da Truth Commerce, salvo disposição legal em contrário.
      </P>

      <H2>13. Contato</H2>
      <P>
        Dúvidas sobre estes Termos: <span className="font-mono">suporte@truthcommerce.com.br</span>.
      </P>
    </article>
  );
}
