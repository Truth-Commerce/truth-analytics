import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminOrgLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
