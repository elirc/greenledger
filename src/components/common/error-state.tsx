"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-6 text-destructive" />
      </div>
      <h3 className="text-base font-medium">{message}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Check your connection and try again.
      </p>
      {onRetry ? (
        <Button
          variant="outline"
          className="mt-4 h-11 px-5"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
