import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Separator } from "@/components/ui/separator";
import type { ActionResult } from "@/lib/action";
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { updateStaff } from "@/modules/users/actions";
import { RemoveStaffButton } from "@/modules/users/components/remove-staff-button";
import { RoleBadge } from "@/modules/users/components/role-badge";
import { StaffAccessForm } from "@/modules/users/components/staff-form";
import { getStaffMember, listGreenhouseOptions } from "@/modules/users/queries";
import {
  formatPhoneDisplay,
  isTempPhoneEmail,
  type StaffAccessInput,
} from "@/modules/users/schema";

export const metadata = { title: "Edit staff" };

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner"] });
  const [staff, greenhouses] = await Promise.all([
    getStaffMember(ctx, id),
    listGreenhouseOptions(ctx),
  ]);
  if (!staff) notFound();

  async function submit(
    input: StaffAccessInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateStaff({ ...input, memberId: id });
  }

  const contact =
    formatPhoneDisplay(staff.phoneNumber) ||
    (isTempPhoneEmail(staff.email) ? "" : staff.email);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={staff.name} backHref="/settings/users" />
      <div className="space-y-2 rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={staff.role} />
          {staff.phoneNumber && !staff.phoneNumberVerified ? (
            <StatusBadge variant="warning">Not signed in yet</StatusBadge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {[contact, `Joined ${formatLagosDate(staff.joinedAt)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <StaffAccessForm
        greenhouses={greenhouses}
        defaultValues={{
          role: staff.role ?? "worker",
          greenhouseIds: staff.greenhouseIds,
        }}
        roleLocked={staff.isSelf}
        onSubmitAction={submit}
      />
      {staff.isSelf ? null : (
        <>
          <Separator />
          <RemoveStaffButton memberId={staff.memberId} name={staff.name} />
        </>
      )}
    </div>
  );
}
