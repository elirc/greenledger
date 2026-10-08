import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Sprout } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { member } from "@/db/schema";
import { auth } from "@/lib/auth";
import { CreateFarmForm } from "@/modules/farm/components/create-farm-form";

export const metadata: Metadata = { title: "Create your farm" };

/**
 * Create-farm screen for a signed-in user without an organisation. Lives
 * outside the (app) group so the app layout's no-org redirect cannot loop.
 */
export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Already part of a farm — nothing to create here.
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
    columns: { id: true },
  });
  if (membership) redirect("/");

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
        <CardContent className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Create your farm
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Welcome{session.user.name ? `, ${session.user.name}` : ""}. Name
              your farm to start a free 14-day trial.
            </p>
          </div>
          <CreateFarmForm />
        </CardContent>
      </Card>
    </main>
  );
}
