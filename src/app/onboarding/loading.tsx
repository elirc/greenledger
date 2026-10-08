import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="bg-secondary flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10">
      <Skeleton className="mb-6 h-10 w-44 rounded-xl" />
      <Card className="w-full max-w-sm" aria-busy="true">
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
