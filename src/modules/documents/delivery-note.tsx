import { Document, Page } from "@react-pdf/renderer";
import { formatLagosDate } from "@/lib/dates";
import { deliveryNoteNumber } from "@/modules/sales/logic";
import type { SaleDocument } from "@/modules/sales/queries";
import { GRADE_LABELS } from "@/modules/sales/schema";
import {
  DocFooter,
  DocHeader,
  docStyles,
  LinesTable,
  MetaBlock,
  pdfQty,
  SignatureBlock,
  TotalsBlock,
} from "./doc-shared";

/** Delivery note — goods only, NO prices (travels with the driver). */
export function DeliveryNote({ doc }: { doc: SaleDocument }) {
  const { sale, farm } = doc;
  const dn = deliveryNoteNumber(sale.invoiceNumber);
  const totalKg = sale.lines.reduce((a, l) => a + l.kg, 0);
  const totalCrates = sale.lines.reduce((a, l) => a + (l.crates ?? 0), 0);

  return (
    <Document title={`Delivery note ${dn}`} author={farm.name}>
      <Page size="A4" style={docStyles.page}>
        <DocHeader
          farmName={farm.name}
          farmLines={[farm.siteName, farm.address]}
          title="DELIVERY NOTE"
          number={dn}
        />
        <MetaBlock
          left={[
            { label: "Deliver to", value: sale.customer.name },
            { label: "Phone", value: sale.customer.phone },
          ]}
          right={[
            { label: "Date", value: formatLagosDate(sale.saleDate) },
            { label: "Invoice", value: sale.invoiceNumber },
          ]}
        />
        <LinesTable
          columns={[
            { header: "Crop", flex: 3 },
            { header: "Grade", flex: 2 },
            { header: "Crates", flex: 1.5, align: "right" },
            { header: "Weight (kg)", flex: 2, align: "right" },
          ]}
          rows={sale.lines.map((l) => [
            l.cropName,
            GRADE_LABELS[l.grade],
            l.crates === null ? "—" : pdfQty(l.crates),
            pdfQty(l.kg),
          ])}
        />
        <TotalsBlock
          rows={[
            { label: "Total crates", value: pdfQty(totalCrates) },
            { label: "Total weight", value: `${pdfQty(totalKg)} kg`, grand: true },
          ]}
        />
        <SignatureBlock
          labels={[
            "Dispatched by (name & signature)",
            "Driver / vehicle",
            "Received in good condition by",
          ]}
        />
        <DocFooter text={`${farm.name} · ${dn}`} />
      </Page>
    </Document>
  );
}
