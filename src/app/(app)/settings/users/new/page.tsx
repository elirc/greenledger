import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createStaff } from "@/modules/users/actions";
import { StaffForm } from "@/modules/users/components/staff-form";
import { listGreenhouseOptions } from "@/modules/users/queries";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const ctx = await requireMember({ roles: ["owner"] });
  const greenhouses = await listGreenhouseOptions(ctx);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Add staff"
        description="They sign in with a code texted to their phone."
        backHref="/settings/users"
      />
      <StaffForm greenhouses={greenhouses} onSubmitAction={createStaff} />
    </div>
  );
}
