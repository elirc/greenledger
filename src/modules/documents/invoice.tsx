import { Document, Page } from "@react-pdf/renderer";
import { formatLagosDate } from "@/lib/dates";
import { deliveryNoteNumber } from "@/modules/sales/logic";
import type { SaleDocument } from "@/modules/sales/queries";
import {
  GRADE_LABELS,
  PRICE_BASIS_LABELS,
  SALE_STATUS_LABELS,
} from "@/modules/sales/schema";
import {
  DocFooter,
  DocHeader,
  docStyles,
  LinesTable,
  MetaBlock,
  NoteBox,
  pdfNaira,
  pdfQty,
  SignatureBlock,
  TotalsBlock,
} from "./doc-shared";

/** Invoice — delivery-note content + unit prices, totals, paid, balance due. */
export function Invoice({ doc }: { doc: SaleDocument }) {
  const { sale, farm } = doc;

  return (
    <Document title={`Invoice ${sale.invoiceNumber}`} author={farm.name}>
      <Page size="A4" style={docStyles.page}>
        <DocHeader
          farmName={farm.name}
          farmLines={[farm.siteName, farm.address]}
          title="INVOICE"
          number={sale.invoiceNumber}
        />
        <MetaBlock
          left={[
            { label: "Bill to", value: sale.customer.name },
            { label: "Phone", value: sale.customer.phone },
            { label: "Email", value: sale.customer.email },
          ]}
          right={[
            { label: "Invoice date", value: formatLagosDate(sale.saleDate) },
            {
              label: "Delivery note",
              value: deliveryNoteNumber(sale.invoiceNumber),
            },
            { label: "Status", value: SALE_STATUS_LABELS[sale.status] },
          ]}
        />
        <LinesTable
          columns={[
            { header: "Crop", flex: 2.4 },
            { header: "Grade", flex: 1.6 },
            { header: "Crates", flex: 1.2, align: "right" },
            { header: "Kg", flex: 1.4, align: "right" },
            { header: "Unit price", flex: 2.6, align: "right" },
            { header: "Amount", flex: 2.4, align: "right" },
          ]}
          rows={sale.lines.map((l) => [
            l.cropName,
            GRADE_LABELS[l.grade],
            l.crates === null ? "—" : pdfQty(l.crates),
            pdfQty(l.kg),
            `${pdfNaira(l.unitPriceKobo)} ${PRICE_BASIS_LABELS[l.basis]}`,
            pdfNaira(l.lineTotalKobo),
          ])}
        />
        <TotalsBlock
          rows={[
            { label: "Total", value: pdfNaira(sale.totalKobo) },
            { label: "Amount paid", value: pdfNaira(sale.amountPaidKobo) },
            {
              label: "Balance due",
              value: pdfNaira(sale.balanceKobo),
              grand: true,
            },
          ]}
        />
        <NoteBox title="Make payment to">
          {/* Placeholder until farm bank details are configurable in settings. */}
          {`${farm.name} — bank name, account number and account name to be added. Quote ${sale.invoiceNumber} as the payment reference.`}
        </NoteBox>
        <SignatureBlock labels={["Issued by", "Received by (customer)"]} />
        <DocFooter text={`${farm.name} · ${sale.invoiceNumber}`} />
      </Page>
    </Document>
  );
}
