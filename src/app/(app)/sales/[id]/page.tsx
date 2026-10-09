import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Truck } from "lucide-react";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { RecordPaymentDialog } from "@/modules/sales/components/record-payment-dialog";
import { SaleStatusBadge } from "@/modules/sales/components/sale-status-badge";
import { getSale } from "@/modules/sales/queries";
import {
  GRADE_LABELS,
  PAYMENT_METHOD_LABELS,
  PRICE_BASIS_LABELS,
  type PaymentMethod,
} from "@/modules/sales/schema";

export const metadata = { title: "Sale" };

const kgFormat = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const sale = await getSale(ctx, id);
  if (!sale) notFound();

  const methodLabel = (m: string) =>
    PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={sale.invoiceNumber}
        description={`${formatLagosDate(sale.saleDate)} · ${sale.customer.name}`}
        backHref="/sales"
        action={<SaleStatusBadge status={sale.status} />}
      />

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-12">
          <a
            href={`/api/pdf/delivery-note?saleId=${sale.id}`}
            target="_blank"
            rel="noopener"
          >
            <Truck className="size-5" /> Delivery note
          </a>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <a
            href={`/api/pdf/invoice?saleId=${sale.id}`}
            target="_blank"
            rel="noopener"
          >
            <FileText className="size-5" /> Invoice
          </a>
        </Button>
      </div>

      <SectionCard
        title="Customer"
        action={
          <Link
            href={`/sales/customers/${sale.customer.id}`}
            className="text-primary inline-flex min-h-11 items-center text-sm underline"
          >
            View
          </Link>
        }
      >
        <p className="font-medium">{sale.customer.name}</p>
        <p className="text-muted-foreground text-sm">
          {[sale.customer.phone, sale.customer.email]
            .filter(Boolean)
            .join(" · ") || "No contact details"}
        </p>
      </SectionCard>

      <SectionCard title="Lines">
        <ul className="divide-border -my-2 divide-y">
          {sale.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {l.cropName} · {GRADE_LABELS[l.grade]}
                </p>
                <p className="text-muted-foreground text-sm">
                  {kgFormat.format(l.kg)} kg
                  {l.crates !== null ? ` · ${kgFormat.format(l.crates)} crates` : ""}
                  {" · "}
                  <MoneyText kobo={l.unitPriceKobo} />{" "}
                  {PRICE_BASIS_LABELS[l.basis]}
                </p>
              </div>
              <MoneyText kobo={l.lineTotalKobo} className="shrink-0 font-medium" />
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total</dt>
            <dd>
              <MoneyText kobo={sale.totalKobo} className="font-semibold" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd>
              <MoneyText kobo={sale.amountPaidKobo} />
            </dd>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-medium">Balance due</dt>
            <dd>
              <MoneyText
                kobo={sale.balanceKobo}
                className={
                  (sale.balanceKobo ?? 0) > 0
                    ? "text-status-danger font-semibold"
                    : "font-semibold"
                }
              />
            </dd>
          </div>
        </dl>
      </SectionCard>

      {sale.status !== "paid" ? (
        <div className="grid">
          <RecordPaymentDialog
            saleId={sale.id}
            saleDate={sale.saleDate}
            balanceKobo={sale.balanceKobo}
          />
        </div>
      ) : null}

      <SectionCard title="Payments">
        {sale.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments yet.</p>
        ) : (
          <ul className="divide-border -my-2 divide-y">
            {sale.payments.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{methodLabel(p.method)}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatLagos(p.receivedAt)} · {p.receivedByName}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <MoneyText kobo={p.amountKobo} className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {sale.notes ? (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap">{sale.notes}</p>
        </SectionCard>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Recorded by {sale.createdByName} on {formatLagos(sale.createdAt)}
      </p>
    </div>
  );
}
