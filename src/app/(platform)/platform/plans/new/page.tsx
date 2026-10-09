import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requirePlatformAdmin } from "@/lib/guard";
import { createPlan } from "@/modules/platform/actions";
import { PlanForm } from "@/modules/platform/components/plan-form";
import type { PlanCreateInput } from "@/modules/platform/schema";

export const metadata = { title: "New plan · Platform" };

export default async function NewPlanPage() {
  await requirePlatformAdmin();

  async function submit(input: PlanCreateInput): Promise<ActionResult<{ id: string }>> {
    "use server";
    return createPlan(input);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="New plan" backHref="/platform/plans" />
      <PlanForm onSubmitAction={submit} submitLabel="Create plan" />
    </div>
  );
}
