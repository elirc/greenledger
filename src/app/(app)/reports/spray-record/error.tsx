"use client";

import { ErrorState } from "@/components/common/error-state";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message={error.message || "This report failed to load."} onRetry={reset} />;
}
