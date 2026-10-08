"use client";

import { ErrorState } from "@/components/common/error-state";

export default function ItemsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message={error.message} onRetry={reset} />;
}
