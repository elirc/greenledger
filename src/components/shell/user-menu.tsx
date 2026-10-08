"use client";

import { CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Stub — Phase 1 wires this to the Better Auth session (name, role,
 * organisation switcher, sign out).
 */
export function UserMenu({ compactIcon = false }: { compactIcon?: boolean }) {
  if (compactIcon) {
    return (
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11"
        aria-label="Account"
      >
        <CircleUserRound className="size-5" />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      className="h-11 w-full justify-start gap-2.5 px-2.5"
      aria-label="Account"
    >
      <CircleUserRound className="size-5" />
      <span className="text-sm text-muted-foreground">Account</span>
    </Button>
  );
}
