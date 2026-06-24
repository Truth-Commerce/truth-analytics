import { requireSession } from '@/modules/auth/require-session';

export default async function AguardandoPage() {
  await requireSession();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Conta aguardando ativação</h1>
      <p>Sua conta foi criada e será ativada pela equipe Truth em breve.</p>
    </main>
  );
}
