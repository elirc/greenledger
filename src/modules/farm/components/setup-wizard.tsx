"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Lock, PartyPopper } from "lucide-react";
import { cn } from "cn";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { CropRow, VarietyRow } from "@/modules/crops/queries";
import { stepCompletion } from "../logic";
import type { GreenhouseRow, SiteRow, StoreRow } from "../queries";
import { SiteForm } from "./site-form";
import { WizardGreenhousesStep } from "./wizard-greenhouses-step";
import { WizardStoresStep } from "./wizard-stores-step";
import { WizardVarietiesStep } from "./wizard-varieties-step";

const SETUP_STEPS = [
  { n: 1, title: "Farm site", blurb: "Name and address of your farm site." },
  {
    n: 2,
    title: "Greenhouses",
    blurb: "Each greenhouse, net house or field block you grow in.",
  },
  { n: 3, title: "Stores", blurb: "Where inputs and produce are kept." },
  { n: 4, title: "Varieties", blurb: "Crops and the varieties you plant." },
  {
    n: 5,
    title: "Items & opening stock",
    blurb: "Your inputs and what is on the shelf today.",
  },
  { n: 6, title: "Done", blurb: "Your farm is ready." },
] as const;

interface SetupData {
  site: SiteRow | null;
  greenhouses: GreenhouseRow[];
  stores: StoreRow[];
  crops: CropRow[];
  varieties: VarietyRow[];
}

export function SetupWizard({
  initialStep,
  data,
}: {
  initialStep: number;
  data: SetupData;
}) {
  const [step, setStep] = useState(initialStep);
  const done = stepCompletion({
    site: data.site,
    greenhouseCount: data.greenhouses.length,
    storeCount: data.stores.length,
    varietyCount: data.varieties.length,
  });
  const current = SETUP_STEPS[step - 1];
  const reachable = (n: number) =>
    SETUP_STEPS.slice(0, n - 1).every((s) => done[s.n]) || n <= step;
  const next = () => setStep((s) => Math.min(6, s + 1));
  const siteId = data.site?.id ?? null;

  return (
    <div className="space-y-5">
      <nav aria-label="Setup progress" className="space-y-3">
        <ol className="flex items-center justify-between gap-1">
          {SETUP_STEPS.map((s) => {
            const isCurrent = s.n === step;
            const isDone = done[s.n] && s.n !== 6;
            return (
              <li key={s.n} className="flex-1">
                <button
                  type="button"
                  disabled={!reachable(s.n)}
                  onClick={() => setStep(s.n)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Step ${s.n}: ${s.title}`}
                  className="flex min-h-11 w-full flex-col items-center gap-1 disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border text-sm font-semibold",
                      isCurrent && "border-primary bg-primary text-primary-foreground",
                      !isCurrent && isDone && "border-primary bg-primary/10 text-primary",
                      !isCurrent && !isDone && "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {isDone && !isCurrent ? <Check className="size-4" /> : s.n}
                  </span>
                  <span className="text-muted-foreground hidden text-xs sm:block">
                    {s.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Progress value={((step - 1) / 5) * 100} />
      </nav>

      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Step {step} of 6
        </p>
        <h2 className="text-lg font-semibold">{current.title}</h2>
        <p className="text-muted-foreground text-sm">{current.blurb}</p>
      </div>

      {step === 1 ? (
        <SiteForm
          key={data.site?.id ?? "new"}
          site={data.site ?? undefined}
          submitLabel="Save & continue"
          onSaved={next}
        />
      ) : null}

      {step === 2 ? (
        siteId ? (
          <WizardGreenhousesStep
            siteId={siteId}
            greenhouses={data.greenhouses}
            onDone={next}
          />
        ) : (
          <NeedSite onBack={() => setStep(1)} />
        )
      ) : null}

      {step === 3 ? (
        siteId ? (
          <WizardStoresStep siteId={siteId} stores={data.stores} onDone={next} />
        ) : (
          <NeedSite onBack={() => setStep(1)} />
        )
      ) : null}

      {step === 4 ? (
        <WizardVarietiesStep
          crops={data.crops}
          varieties={data.varieties}
          onDone={next}
        />
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <div className="bg-muted/40 flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
            <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
              <Lock className="text-muted-foreground size-6" />
            </div>
            <h3 className="font-medium">Available after the store module (Phase 2)</h3>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Adding items and opening stock (including CSV import) arrives with
              the store module. You can skip this step for now.
            </p>
          </div>
          <Button type="button" className="h-11 w-full" onClick={next}>
            Skip for now
          </Button>
        </div>
      ) : null}

      {step === 6 ? <DoneStep data={data} /> : null}
    </div>
  );
}

function NeedSite({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-muted-foreground text-sm">
        Save your farm site first.
      </p>
      <Button type="button" variant="outline" className="h-11" onClick={onBack}>
        Go to step 1
      </Button>
    </div>
  );
}

function DoneStep({ data }: { data: SetupData }) {
  const rows = [
    { label: "Site", value: data.site?.name ?? "—" },
    { label: "Greenhouses", value: String(data.greenhouses.length) },
    {
      label: "Stores",
      value: data.stores.map((s) => s.name).join(", ") || "—",
    },
    { label: "Crops", value: data.crops.map((c) => c.name).join(", ") || "—" },
    { label: "Varieties", value: String(data.varieties.length) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center">
        <div className="bg-primary/10 mb-3 flex size-14 items-center justify-center rounded-full">
          <PartyPopper className="text-primary size-7" />
        </div>
        <h3 className="text-lg font-semibold">Your farm is set up</h3>
        <p className="text-muted-foreground text-sm">
          You can change any of this later in Settings → Farm structure.
        </p>
      </div>
      <SectionCard title="Summary">
        <dl className="divide-border divide-y">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="text-right font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <Button asChild className="h-11 w-full">
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}
