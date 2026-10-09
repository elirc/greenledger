import { LoadingList } from "@/components/common/loading-list";

export default function Loading() {
  return (
    <main className="bg-secondary flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <LoadingList rows={2} />
      </div>
    </main>
  );
}
