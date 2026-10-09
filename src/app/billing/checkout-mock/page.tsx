import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyText } from "@/components/common/money-text";
import { env } from "@/lib/env";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { MockCheckoutButton } from "@/modules/billing/components/mock-checkout";
import { getPlanByCode } from "@/modules/billing/queries";
import { mockCheckoutSchema } from "@/modules/billing/schema";

export const metadata: Metadata = { title: "Checkout (test mode)" };

/**
 * Mock Paystack hosted page (mock payments driver only). Lives outside the
 * (app) group: a stand-in for an external page, no farm shell.
 */
export default async function CheckoutMockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? sp[k] : undefined);

  let ctx;
  try {
    ctx = await requireMember({ roles: ["owner"] });
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHENTICATED") redirect("/sign-in");
    throw e;
  }

  const parsed = mockCheckoutSchema.safeParse({
    ref: one("ref"),
    org: one("org"),
    plan: one("plan"),
    amount: one("amount"),
    email: one("email"),
    callback: one("callback") ?? "",
  });

  const invalid =
    env.ADAPTER_PAYMENTS !== "mock"
      ? "Test checkout is disabled — payments run through Paystack."
      : !parsed.success
        ? "This checkout link is incomplete or invalid."
        : parsed.data.org !== ctx.orgId
          ? "This checkout link belongs to a different farm."
          : null;

  const plan = parsed.success ? await getPlanByCode(ctx, parsed.data.plan) : null;

  return (
    <main className="bg-secondary flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl">
          <CreditCard className="size-6" />
        </div>
        <span className="text-primary text-2xl font-semibold tracking-tight">
          Paystack (test mode)
        </span>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          {invalid || !parsed.success ? (
            <>
              <p className="text-sm">{invalid ?? "Invalid checkout."}</p>
              <Link
                href="/settings/billing"
                className="text-primary inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
              >
                Back to billing
              </Link>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">{ctx.org.name}</p>
                <p className="text-lg font-semibold">
                  GreenLedger {plan?.name ?? parsed.data.plan} plan
                </p>
                <p className="text-muted-foreground text-sm">{parsed.data.email}</p>
              </div>
              <div className="flex items-baseline justify-between border-y py-3">
                <span className="text-sm">Amount due (monthly)</span>
                <MoneyText kobo={parsed.data.amount} className="text-xl font-semibold" />
              </div>
              <MockCheckoutButton checkout={parsed.data} />
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <ShieldCheck className="size-4" />
                Test mode — no card is charged. Ref {parsed.data.ref.slice(0, 8)}
              </p>
              <Link
                href="/settings/billing"
                className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
              >
                Cancel and go back
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
