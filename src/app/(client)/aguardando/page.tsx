import { requireSession } from '@/modules/auth/require-session';
import { Logo } from '@/components/ui/Logo';

export default async function AguardandoPage() {
  await requireSession();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base p-8 text-center">
      <Logo withMark size="lg" />
      <div className="max-w-sm space-y-2">
        <h1 className="font-heading text-xl font-semibold text-white">Conta aguardando ativação</h1>
        <p className="text-sm text-muted">Sua conta foi criada e será ativada pela equipe Truth em breve.</p>
      </div>
    </main>
  );
}
