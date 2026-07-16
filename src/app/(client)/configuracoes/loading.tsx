import { Skeleton } from '@/components/ui/Skeleton';

export default function ConfiguracoesLoading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </main>
  );
}
