import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base p-8 text-center">
      <Logo withMark size="md" />
      <div className="max-w-sm space-y-2">
        <h1 className="font-heading text-xl font-semibold text-white">
          Página não encontrada (404)
        </h1>
        <p className="text-sm text-muted">
          O endereço que você acessou não existe ou foi removido.
        </p>
      </div>
      <Button as="a" href="/" variant="secondary">
        Voltar ao início
      </Button>
    </main>
  );
}
