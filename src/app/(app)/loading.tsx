import { LoadingList } from "@/components/common/loading-list";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-7 w-44" />
      <LoadingList rows={6} />
    </div>
  );
}
