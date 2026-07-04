import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-80 rounded-full" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
