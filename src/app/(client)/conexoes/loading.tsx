import { Skeleton } from '@/components/ui/Skeleton';

export default function ConexoesLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </main>
  );
}
