import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member } from "@/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { ReadOnlyBanner } from "@/components/shell/read-only-banner";
import { requireMember } from "@/lib/guard";

// Auth gate must run before anything renders — this layout is deliberately blocking.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
    orderBy: asc(member.createdAt),
  });
  if (!membership) {
    const isPlatformAdmin = Boolean(
      (session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin,
    );
    redirect(isPlatformAdmin ? "/platform" : "/onboarding");
  }

  // Same org status every mutation sees (guard → computeOrgStatus).
  const ctx = await requireMember().catch(() => null);

  return (
    <AppShell>
      {ctx?.org.status === "read_only" ? (
        <ReadOnlyBanner isOwner={ctx.role === "owner"} />
      ) : null}
      {children}
    </AppShell>
  );
}
