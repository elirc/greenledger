"use client";

import { ErrorState } from "@/components/common/error-state";

export default function EquipmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message={error.message} onRetry={reset} />;
}
