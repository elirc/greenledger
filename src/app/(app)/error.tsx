"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message="This screen failed to load." onRetry={reset} />;
}
