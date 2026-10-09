import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requirePlatformAdmin } from "@/lib/guard";
import { updatePlan } from "@/modules/platform/actions";
import { PlanForm } from "@/modules/platform/components/plan-form";
import { getPlan } from "@/modules/platform/queries";
import type { PlanCreateInput } from "@/modules/platform/schema";

export const metadata = { title: "Edit plan · Platform" };

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePlatformAdmin();
  const plan = await getPlan(admin, id);
  if (!plan) notFound();

  async function submit(input: PlanCreateInput): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updatePlan({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={`Edit ${plan.name}`} backHref="/platform/plans" />
      <PlanForm
        defaultValues={{
          code: plan.code,
          name: plan.name,
          maxGreenhouses: plan.maxGreenhouses,
          // kobo → naira text for the form; the action converts back with nairaToKobo.
          monthlyPriceNaira: (plan.monthlyPriceKobo / 100).toFixed(2),
          paystackPlanCode: plan.paystackPlanCode ?? "",
          isActive: plan.isActive,
        }}
        onSubmitAction={submit}
        submitLabel="Save plan"
      />
    </div>
  );
}
