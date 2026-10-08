import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="flex justify-between gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="size-9 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
