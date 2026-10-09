import { notFound } from "next/navigation";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { addDays, formatLagosDate, lagosDateOf, todayLagos } from "@/lib/dates";
import { requirePlatformAdmin } from "@/lib/guard";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";
import { AuditList } from "@/modules/platform/components/audit-list";
import { OrgStatusBadge } from "@/modules/platform/components/org-status-badge";
import {
  ExtendTrialButtons,
  SubscriptionForm,
} from "@/modules/platform/components/subscription-form";
import { getOrganisationDetail, listAllPlans } from "@/modules/platform/queries";

export const metadata = { title: "Organisation · Platform" };

const roleLabel = (r: string) =>
  (ROLES as readonly string[]).includes(r) ? ROLE_LABELS[r as Role] : r;

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requirePlatformAdmin();
  const [org, plans] = await Promise.all([getOrganisationDetail(admin, id), listAllPlans(admin)]);
  if (!org) notFound();

  const defaults = {
    orgId: org.id,
    planId: org.planId ?? plans.find((p) => p.isActive)?.id ?? plans[0]?.id ?? "",
    status: org.subStatus ?? ("trialing" as const),
    trialEndsOn: org.trialEndsAt ? lagosDateOf(org.trialEndsAt) : addDays(todayLagos(), 14),
    periodEndsOn: org.currentPeriodEnd ? lagosDateOf(org.currentPeriodEnd) : "",
    reason: "",
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={org.name}
        description={`${org.slug} · created ${formatLagosDate(org.createdAt)}`}
        backHref="/platform/orgs"
        action={<OrgStatusBadge status={org.orgStatus} />}
      />

      <SectionCard title="Subscription">
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{org.planName ?? "—"}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{org.subStatus ?? "no subscription"}</dd>
          <dt className="text-muted-foreground">Trial ends</dt>
          <dd>{org.trialEndsAt ? formatLagosDate(org.trialEndsAt) : "—"}</dd>
          <dt className="text-muted-foreground">Paid until</dt>
          <dd>{org.currentPeriodEnd ? formatLagosDate(org.currentPeriodEnd) : "—"}</dd>
          <dt className="text-muted-foreground">Greenhouses</dt>
          <dd>
            {org.greenhouses}
            {org.maxGreenhouses !== null ? ` of ${org.maxGreenhouses}` : ""}
          </dd>
          <dt className="text-muted-foreground">Paystack</dt>
          <dd className="truncate font-mono text-xs">
            {org.paystackSubscriptionCode ?? org.paystackCustomerCode ?? "—"}
          </dd>
        </dl>
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium">Extend trial</p>
          <ExtendTrialButtons orgId={org.id} disabled={org.subStatus === "active" || !org.subscriptionId} />
        </div>
        {plans.length > 0 ? (
          <SubscriptionForm
            defaultValues={defaults}
            plans={plans.map((p) => ({ id: p.id, name: p.name, isActive: p.isActive }))}
          />
        ) : (
          <p className="text-muted-foreground text-sm">Create a plan first.</p>
        )}
      </SectionCard>

      <SectionCard title={`Users (${org.members.length})`}>
        {org.members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No members.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {org.members.map((m) => (
              <li key={m.memberId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{m.name}</span>
                  {m.phoneNumber ? (
                    <span className="text-muted-foreground"> · {m.phoneNumber}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">{roleLabel(m.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Recent activity">
        {org.recentAudit.length === 0 ? (
          <p className="text-muted-foreground text-sm">No audit entries yet.</p>
        ) : (
          <AuditList rows={org.recentAudit} showOrg={false} />
        )}
      </SectionCard>
    </div>
  );
}
