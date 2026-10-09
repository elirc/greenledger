import Link from "next/link";
import { SprayCan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { ApplicationForm } from "@/modules/applications/components/application-form";
import { getApplicationFormRefs } from "@/modules/applications/queries";
import { dateToLagosLocal } from "@/modules/applications/schema";

export const metadata = { title: "Log application" };

export default async function NewApplicationPage() {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const refs = await getApplicationFormRefs(ctx);
  const canManage = ctx.role === "owner" || ctx.role === "manager";

  const missing =
    refs.greenhouses.length === 0
      ? {
          title: ctx.role === "worker" ? "No greenhouses assigned" : "No greenhouses yet",
          description:
            ctx.role === "worker"
              ? "Ask your farm manager to assign you to a greenhouse."
              : "Add a greenhouse before logging applications.",
          href: canManage ? "/settings/farm" : null,
          cta: "Set up greenhouses",
        }
      : refs.cycles.length === 0
        ? {
            title: "No active crop cycles",
            description: "Applications are logged against a growing crop cycle.",
            href: canManage ? "/cycles" : null,
            cta: "Open crop cycles",
          }
        : refs.stores.length === 0
          ? {
              title: "No input store",
              description: "Inputs are drawn from an input store. Set one up first.",
              href: canManage ? "/settings/farm" : null,
              cta: "Set up stores",
            }
          : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Log application"
        description="Fertigation or spray — inputs are drawn from the store."
        backHref="/applications"
      />
      {missing ? (
        <EmptyState icon={SprayCan} title={missing.title} description={missing.description}>
          {missing.href ? (
            <Button asChild className="h-11">
              <Link href={missing.href}>{missing.cta}</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ApplicationForm refs={refs} nowLocal={dateToLagosLocal(new Date())} />
      )}
    </div>
  );
}
