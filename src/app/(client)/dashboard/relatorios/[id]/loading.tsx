import { Skeleton } from '@/components/ui/Skeleton';

export default function RelatorioLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
