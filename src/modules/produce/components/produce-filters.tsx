"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADES, GRADE_SHORT, type Grade } from "@/modules/harvest/schema";
import type { ProduceStoreOption } from "../queries";

const ALL = "__all";

export function produceHref(p: {
  tab?: "stock" | "harvests";
  store?: string;
  grade?: Grade;
}) {
  const sp = new URLSearchParams();
  if (p.tab && p.tab !== "stock") sp.set("tab", p.tab);
  if (p.store) sp.set("store", p.store);
  if (p.grade) sp.set("grade", p.grade);
  const q = sp.toString();
  return q ? `/produce?${q}` : "/produce";
}

function Segments<T extends string>({
  label,
  items,
}: {
  label: string;
  items: { label: string; href: string; active: boolean; key: T | "all" }[];
}) {
  return (
    <nav className="bg-muted flex flex-1 gap-1 rounded-lg p-1" aria-label={label}>
      {items.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          aria-current={s.active ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors",
            s.active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** Stock / Harvests tabs. */
export function ProduceTabs({ tab }: { tab: "stock" | "harvests" }) {
  return (
    <Segments
      label="View"
      items={[
        { key: "stock", label: "Stock", href: produceHref({}), active: tab === "stock" },
        {
          key: "harvests",
          label: "Harvests",
          href: produceHref({ tab: "harvests" }),
          active: tab === "harvests",
        },
      ]}
    />
  );
}

/** Grade segment + store select for the stock view. */
export function ProduceStockFilters({
  storeId,
  grade,
  stores,
}: {
  storeId?: string;
  grade?: Grade;
  stores: ProduceStoreOption[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Segments
        label="Grade"
        items={[
          {
            key: "all" as const,
            label: "All",
            href: produceHref({ store: storeId }),
            active: !grade,
          },
          ...GRADES.map((g) => ({
            key: g,
            label: GRADE_SHORT[g],
            href: produceHref({ store: storeId, grade: g }),
            active: grade === g,
          })),
        ]}
      />
      {stores.length > 1 ? (
        <Select
          value={storeId ?? ALL}
          onValueChange={(v) =>
            router.push(produceHref({ store: v === ALL ? undefined : v, grade }))
          }
        >
          <SelectTrigger className="h-11 w-full sm:w-52" aria-label="Store">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="min-h-11">
              All stores
            </SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-h-11">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
