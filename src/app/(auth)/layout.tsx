import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Public auth screens: centered card on a green-tinted background, no nav. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-secondary flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl">
          <Sprout className="size-6" />
        </div>
        <span className="text-primary text-2xl font-semibold tracking-tight">
          GreenLedger
        </span>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent>{children}</CardContent>
      </Card>
      <p className="text-muted-foreground mt-6 max-w-sm text-center text-xs">
        Inventory for greenhouse farms — inputs, harvests, sales and equipment.
      </p>
    </main>
  );
}
