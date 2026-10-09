import type { ReactNode } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AuthError } from "@/lib/errors";
import { requirePlatformAdmin } from "@/lib/guard";
import { PlatformNav } from "@/modules/platform/components/platform-nav";

// Auth gate must run before anything renders.
export const instant = false;

/**
 * Platform admin area: its own minimal chrome — NOT the farm AppShell (a
 * platform admin has no farm membership).
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let denied = false;
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
    denied = true;
  }

  if (denied) {
    return (
      <main className="bg-background flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
          <ShieldAlert className="text-muted-foreground size-6" />
        </div>
        <h1 className="text-lg font-semibold">Platform admins only</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Your account does not have access to the platform admin area.
        </p>
      </main>
    );
  }

  return (
    <div className="bg-background min-h-dvh">
      <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-14 items-center gap-2">
            <Image src="/icon.svg" alt="" width={26} height={26} />
            <span className="text-base font-semibold tracking-tight">GreenLedger</span>
            <span className="text-muted-foreground text-sm">· Platform admin</span>
          </div>
          <div className="pb-2">
            <PlatformNav />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-12">{children}</main>
    </div>
  );
}
