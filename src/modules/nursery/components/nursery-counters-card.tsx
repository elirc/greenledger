import { SectionCard } from "@/components/common/section-card";
import { availableSeedlings, germinationRatePct } from "../logic";
import type { NurseryBatchDetail } from "../queries";

const numberFmt = new Intl.NumberFormat("en-NG");

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {numberFmt.format(value)}
      </dd>
    </div>
  );
}

/** Sown / germinated / ready / transplanted / discarded + germination rate. */
export function NurseryCountersCard({ batch }: { batch: NurseryBatchDetail }) {
  const rate = germinationRatePct(batch);
  const available = availableSeedlings(batch);
  return (
    <SectionCard
      title="Counts"
      action={
        rate !== null ? (
          <span className="text-sm font-medium">
            {rate.toFixed(1)}% germination
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">
            Germination not counted yet
          </span>
        )
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Counter label="Sown" value={batch.seedsSown} />
        <Counter label="Germinated" value={batch.germinated} />
        <Counter label="Ready" value={batch.ready} />
        <Counter label="Transplanted" value={batch.transplanted} />
        <Counter label="Discarded" value={batch.discarded} />
        <Counter
          label={batch.status === "open" ? "Still in trays" : "Left over"}
          value={available}
        />
      </dl>
    </SectionCard>
  );
}
