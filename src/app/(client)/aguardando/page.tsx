import { requireSession } from '@/modules/auth/require-session';
import { signOutAction } from '@/actions/auth.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const passos = [
  { titulo: 'Análise da conta', texto: 'Nossa equipe revisa seu cadastro e define o plano ideal para a sua operação.' },
  { titulo: 'Ativação', texto: 'Você recebe um e-mail assim que a conta for ativada — normalmente em até 1 dia útil.' },
  { titulo: 'Primeiro relatório', texto: 'Com a conta ativa, você conecta o Bling e gera sua primeira análise em minutos.' },
];

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Conta em análise' };

export default async function AguardandoPage() {
  await requireSession();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-base p-8">
      <Logo withMark size="lg" />
      <div className="max-w-md space-y-2 text-center">
        <h1 className="font-heading text-xl font-semibold text-white">Conta aguardando ativação</h1>
        <p className="text-sm text-muted">
          Sua conta foi criada e será ativada pela equipe Truth em breve.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardContent>
          <h2 className="mb-4 font-heading text-sm font-semibold text-white">O que acontece agora</h2>
          <ol className="flex flex-col gap-4">
            {passos.map((p, i) => (
              <li key={p.titulo} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand-glow font-mono text-[10px] text-brand">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{p.titulo}</p>
                  <p className="text-sm text-muted">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button as="a" href="mailto:suporte@truthcommerce.com.br" variant="secondary" size="sm">
          Falar com o suporte
        </Button>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
