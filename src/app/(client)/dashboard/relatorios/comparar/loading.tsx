import { Skeleton } from '@/components/ui/Skeleton';

export default function CompararLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-12 w-full max-w-xl rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
