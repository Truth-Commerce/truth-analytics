import { Skeleton } from '@/components/ui/Skeleton';

export default function AnalistaLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
