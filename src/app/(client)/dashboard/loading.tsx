import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </main>
  );
}
