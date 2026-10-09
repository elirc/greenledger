import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { MoneyText } from "@/components/common/money-text";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagosDate } from "@/lib/dates";
import { monthLabel, shiftMonth } from "@/modules/tasks/logic";
import type { ExpenseRow, ExpenseTotals } from "../queries";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "../schema";

const fmtDate = (d: string) => formatLagosDate(`${d}T12:00:00Z`);

export function expensesHref(p: { month: string; category?: ExpenseCategory }) {
  const q = new URLSearchParams({ month: p.month });
  if (p.category) q.set("category", p.category);
  return `/expenses?${q.toString()}`;
}

/** Prev / next month + category chips (links — no client JS). */
export function ExpenseFilters({
  month,
  category,
  currentMonth,
  totals,
}: {
  month: string;
  category?: ExpenseCategory;
  currentMonth: string;
  totals: ExpenseTotals;
}) {
  const next = shiftMonth(month, 1);
  return (
    <div className="space-y-3">
      <nav className="flex items-center justify-between gap-2" aria-label="Month">
        <Link
          href={expensesHref({ month: shiftMonth(month, -1), category })}
          aria-label="Previous month"
          className="hover:bg-muted flex size-11 items-center justify-center rounded-md border"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-medium">{monthLabel(month)}</span>
        {next <= currentMonth ? (
          <Link
            href={expensesHref({ month: next, category })}
            aria-label="Next month"
            className="hover:bg-muted flex size-11 items-center justify-center rounded-md border"
          >
            <ChevronRight className="size-5" />
          </Link>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </nav>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="list">
        <Chip href={expensesHref({ month })} active={!category}>
          All
        </Chip>
        {totals.byCategory
          .filter((c) => c.count > 0 || c.category === category)
          .map((c) => (
            <Chip
              key={c.category}
              href={expensesHref({ month, category: c.category })}
              active={category === c.category}
            >
              {EXPENSE_CATEGORY_LABELS[c.category]}
            </Chip>
          ))}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="listitem"
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

/** Per-category totals for the month, with a grand-total row. */
export function ExpenseTotalsTable({ totals }: { totals: ExpenseTotals }) {
  const rows = totals.byCategory.filter((c) => c.count > 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Entries</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.category}>
            <TableCell>{EXPENSE_CATEGORY_LABELS[c.category]}</TableCell>
            <TableCell className="text-right tabular-nums">{c.count}</TableCell>
            <TableCell className="text-right">
              <MoneyText kobo={c.totalKobo} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">Total</TableCell>
          <TableCell className="text-right tabular-nums">
            {rows.reduce((a, c) => a + c.count, 0)}
          </TableCell>
          <TableCell className="text-right font-medium">
            <MoneyText kobo={totals.totalKobo} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function ExpenseList({ rows }: { rows: ExpenseRow[] }) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {rows.map((e) => {
        const charged = e.cycleCode ?? e.greenhouseName ?? e.siteName ?? "Whole farm";
        return (
          <li key={e.id}>
            <Link
              href={`/expenses/${e.id}`}
              className="hover:bg-muted/50 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {EXPENSE_CATEGORY_LABELS[e.category]}
                  <span className="text-muted-foreground font-normal">
                    {" "}· {fmtDate(e.incurredDate)}
                  </span>
                </span>
                <span className="text-muted-foreground truncate text-sm">
                  {[charged, e.description].filter(Boolean).join(" · ")}
                </span>
              </span>
              <MoneyText kobo={e.amountKobo} className="shrink-0 font-medium" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
