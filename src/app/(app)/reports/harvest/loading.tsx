import { LoadingList } from "@/components/common/loading-list";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="mb-4 h-7 w-52" />
      <LoadingList rows={6} />
    </div>
  );
}
