import { Skeleton } from '@/components/ui/Skeleton';

export default function PlanoDeAcaoLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-12 rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
