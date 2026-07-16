import { Skeleton } from '@/components/ui/Skeleton';

export default function PlaybooksLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
