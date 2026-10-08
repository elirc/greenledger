import type { Metadata } from "next";
import { CloudOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
        <CloudOff className="size-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Logged work is saved on this phone and will sync when you&apos;re back
        online. You can keep logging harvests, stock issues and tasks from the
        pages you already opened.
      </p>
    </main>
  );
}
