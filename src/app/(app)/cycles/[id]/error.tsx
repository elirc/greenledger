"use client";

import { ErrorState } from "@/components/common/error-state";

export default function CycleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message={error.message} onRetry={reset} />;
}
