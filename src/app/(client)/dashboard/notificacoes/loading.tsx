import { Skeleton } from '@/components/ui/Skeleton';

export default function NotificacoesLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
