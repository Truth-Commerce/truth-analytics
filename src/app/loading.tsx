import { Spinner } from '@/components/ui/Spinner';

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base">
      <Spinner size="lg" />
    </main>
  );
}
