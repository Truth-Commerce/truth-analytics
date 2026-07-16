import { Skeleton } from '@/components/ui/Skeleton';

export default function ConsultoriaLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
