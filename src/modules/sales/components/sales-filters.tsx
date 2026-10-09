"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SALE_STATUS_LABELS, SALE_STATUSES } from "../schema";

const ALL = "all";

/** Status + customer filters for the sales list, kept in the URL. */
export function SalesFilters({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={params.get("status") ?? ALL}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="h-11 w-full" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="min-h-11">
            All statuses
          </SelectItem>
          {SALE_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="min-h-11">
              {SALE_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get("customerId") ?? ALL}
        onValueChange={(v) => setParam("customerId", v)}
      >
        <SelectTrigger className="h-11 w-full" aria-label="Filter by customer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className="min-h-11">
            All customers
          </SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id} className="min-h-11">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
