"use client";

import { ErrorState } from "@/components/common/error-state";

export default function CheckoutMockError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="bg-secondary flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <ErrorState message={error.message} onRetry={reset} />
      </div>
    </main>
  );
}
