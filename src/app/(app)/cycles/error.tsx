"use client";

import { ErrorState } from "@/components/common/error-state";

export default function CyclesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message={error.message} onRetry={reset} />;
}
