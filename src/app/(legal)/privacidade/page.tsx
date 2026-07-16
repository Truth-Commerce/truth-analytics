import type { Metadata } from 'next';
import Link from 'next/link';

import { H2, P, UL } from '../tipografia';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Truth Analytics',
  description:
    'Como a Truth Commerce trata dados pessoais e dados de vendas na plataforma Truth Analytics (LGPD).',
};

export default function PrivacidadePage() {
  return (
    <article>
      <h1 className="font-heading text-2xl font-bold text-white">Política de Privacidade</h1>
      <p className="mt-2 text-xs text-dim">Última atualização: 14 de julho de 2026.</p>

      <H2>1. Quem é o controlador</H2>
      <P>
        A Truth Commerce (&quot;nós&quot;) é a controladora dos dados pessoais tratados na
        plataforma Truth Analytics, nos termos da Lei Geral de Proteção de Dados (Lei nº
        13.709/2018 — LGPD). Canal de contato do controlador e do encarregado pelo tratamento de
        dados: <span className="font-mono">suporte@truthcommerce.com.br</span>.
      </P>

      <H2>2. Quais dados tratamos</H2>
      <UL>
        <li>
          <strong className="text-white/90">Dados de conta:</strong> nome da empresa, e-mail dos
          usuários e senha (armazenada apenas como hash criptográfico — nunca em claro).
        </li>
        <li>
          <strong className="text-white/90">Dados operacionais de vendas (via ERP Bling, com a
          sua autorização):</strong> identificador do pedido, canal de venda, data, valor total,
          frete e itens vendidos. Não importamos nome, CPF, endereço ou contato dos consumidores
          finais dos seus pedidos.
        </li>
        <li>
          <strong className="text-white/90">Dados públicos de mercado:</strong> preços e anúncios
          publicamente disponíveis em marketplaces, coletados para benchmark dos seus produtos.
        </li>
        <li>
          <strong className="text-white/90">Registros de segurança:</strong> endereço IP e
          horário de tentativas de login, cadastro e redefinição de senha (antifraude e prevenção
          de abuso), além de trilha de auditoria das ações sensíveis na plataforma.
        </li>
      </UL>

      <H2>3. Para que usamos (finalidades e bases legais)</H2>
      <UL>
        <li>
          Prestar o serviço contratado — gerar relatórios, alertas, plano de ação e benchmark
          (execução de contrato, art. 7º, V, da LGPD).
        </li>
        <li>
          Autenticação, segurança, prevenção a fraudes e cumprimento de obrigações legais de
          guarda de registros (legítimo interesse e obrigação legal, art. 7º, II e IX).
        </li>
        <li>
          Comunicações operacionais por e-mail — relatório pronto, alertas, avisos de conta
          (execução de contrato). Não enviamos marketing sem seu consentimento.
        </li>
      </UL>

      <H2>4. Inteligência artificial e operadores</H2>
      <P>
        Para gerar as análises, enviamos métricas agregadas de vendas do período (totais por canal,
        evolução diária, produtos mais vendidos, comparativos de preço) para a Anthropic, operadora
        do modelo de IA Claude, que processa esses dados exclusivamente para produzir o relatório
        da sua organização. Também utilizamos como operadores: Vercel (hospedagem da aplicação),
        Neon (banco de dados), Resend (envio de e-mails transacionais) e SerpApi (consulta de
        preços públicos de mercado). Esses fornecedores podem processar dados em servidores fora do
        Brasil (Estados Unidos); a transferência internacional segue o art. 33 da LGPD, com
        salvaguardas contratuais adequadas.
      </P>

      <H2>5. Com quem compartilhamos</H2>
      <P>
        Não vendemos nem alugamos dados pessoais. Compartilhamos dados apenas com os operadores
        listados acima (estritamente para a prestação do serviço), com analistas da Truth Commerce
        designados para a sua conta, e quando exigido por lei ou ordem de autoridade competente.
      </P>

      <H2>6. Por quanto tempo guardamos</H2>
      <UL>
        <li>Dados de conta e de vendas: enquanto durar a relação contratual.</li>
        <li>
          Após o encerramento da conta ou pedido de exclusão: eliminação em até 30 dias corridos,
          ressalvados registros cuja guarda seja exigida por lei (ex.: registros de acesso — Marco
          Civil da Internet) e o registro mínimo da própria exclusão.
        </li>
        <li>Cópias de segurança (backups) expiram nos ciclos normais de rotação.</li>
      </UL>

      <H2>7. Como protegemos</H2>
      <UL>
        <li>Criptografia em trânsito (TLS) em toda a plataforma.</li>
        <li>Tokens de acesso ao ERP armazenados cifrados (AES-256-GCM).</li>
        <li>Senhas armazenadas com hash bcrypt; links de redefinição de uso único e com expiração.</li>
        <li>Isolamento por organização: cada cliente só acessa os dados da própria conta.</li>
        <li>Trilha de auditoria das ações sensíveis e limitação de tentativas de acesso.</li>
      </UL>

      <H2>8. Seus direitos (art. 18 da LGPD)</H2>
      <P>
        Você pode solicitar, a qualquer momento: confirmação da existência de tratamento; acesso
        aos dados; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou
        eliminação de dados desnecessários; portabilidade; informação sobre compartilhamentos;
        e revogação do consentimento. Para exercer, escreva para{' '}
        <span className="font-mono">suporte@truthcommerce.com.br</span> — respondemos nos prazos da
        LGPD. Você também pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD).
      </P>

      <H2>9. Cookies</H2>
      <P>
        Usamos apenas cookies essenciais de sessão para autenticação. Não usamos cookies de
        rastreamento ou publicidade.
      </P>

      <H2>10. Alterações desta política</H2>
      <P>
        Mudanças relevantes serão comunicadas na plataforma ou por e-mail, com atualização da data
        no topo desta página. O uso continuado após a comunicação vale como ciência. Consulte
        também os nossos{' '}
        <Link href="/termos" className="text-brand hover:underline">
          Termos de Uso
        </Link>
        .
      </P>
    </article>
  );
}
