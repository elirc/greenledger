import { LoadingList } from "@/components/common/loading-list";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-11 w-full" />
      <LoadingList rows={5} />
    </div>
  );
}
