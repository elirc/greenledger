import type { ReactNode } from "react";
import { QtyText } from "@/components/common/qty-text";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { UNIT_LABELS } from "@/lib/units";
import type { ItemDetail } from "../queries";
import { ITEM_CATEGORY_LABELS } from "../schema";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Item master data + on-hand summary (no money). */
export function ItemInfoCard({
  item,
  onHandByStore,
}: {
  item: ItemDetail;
  onHandByStore: { storeId: string; storeName: string; onHand: number }[];
}) {
  const total = onHandByStore.reduce((a, s) => a + s.onHand, 0);
  const belowReorder = item.reorderLevel > 0 && total < item.reorderLevel;
  const npk = [item.nPct, item.pPct, item.kPct];

  return (
    <SectionCard
      title="Details"
      action={
        <div className="flex gap-1.5">
          {!item.isActive ? <StatusBadge>Inactive</StatusBadge> : null}
          {belowReorder ? (
            <StatusBadge variant="warning">Below reorder</StatusBadge>
          ) : null}
        </div>
      }
    >
      <dl className="divide-border divide-y">
        <Row label="Category">{ITEM_CATEGORY_LABELS[item.category]}</Row>
        <Row label="Base unit">{UNIT_LABELS[item.baseUnit]}</Row>
        <Row label="On hand (all stores)">
          <QtyText qty={total} unit={item.baseUnit} />
        </Row>
        {onHandByStore.map((s) => (
          <Row key={s.storeId} label={`· ${s.storeName}`}>
            <QtyText qty={s.onHand} unit={item.baseUnit} />
          </Row>
        ))}
        <Row label="Reorder level">
          {item.reorderLevel > 0 ? (
            <QtyText qty={item.reorderLevel} unit={item.baseUnit} />
          ) : (
            "None"
          )}
        </Row>
        {item.category === "agrochemical" ? (
          <>
            <Row label="Active ingredient">{item.activeIngredient ?? "—"}</Row>
            <Row label="PHI">
              {item.phiDays === null ? "—" : `${item.phiDays} days`}
            </Row>
            <Row label="REI">
              {item.reiHours === null ? "—" : `${item.reiHours} hours`}
            </Row>
          </>
        ) : null}
        {item.category === "fertiliser" && npk.some((n) => n !== null) ? (
          <Row label="N-P-K">
            {npk.map((n) => (n === null ? "–" : `${n}`)).join(" - ")}
          </Row>
        ) : null}
      </dl>
      {item.notes ? (
        <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">
          {item.notes}
        </p>
      ) : null}
    </SectionCard>
  );
}
