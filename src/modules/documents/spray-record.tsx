import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { UNIT_LABELS } from "@/lib/units";
import type {
  FarmLetterhead,
  ReportRange,
  SprayRecordRow,
} from "@/modules/reports/queries";
import { SPRAY_FOLLOW_UP_DAYS } from "@/modules/reports/queries";
import {
  DocFooter,
  DocHeader,
  docStyles,
  LinesTable,
  MetaBlock,
  NoteBox,
  pdfQty,
} from "./doc-shared";

/**
 * Spray record (ARCHITECTURE §10): every spray in the range with products,
 * rates, PHI/REI label snapshots, entry/harvest-safe times, operator, and
 * the harvests that followed — harvests inside the PHI window are flagged.
 * No money on this document.
 */

const styles = StyleSheet.create({
  app: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: "#cccccc",
  },
  appTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  appMeta: { fontSize: 9, color: "#444444", marginBottom: 6 },
  safety: { flexDirection: "row", gap: 18, marginTop: 6, fontSize: 9 },
  label: { color: "#666666" },
  following: { marginTop: 4, fontSize: 9 },
  flag: { color: "#b42318", fontFamily: "Helvetica-Bold" },
  ok: { color: "#1f6f43" },
  summary: { fontSize: 10, marginBottom: 12 },
});

function SprayBlock({ row }: { row: SprayRecordRow }) {
  return (
    <View style={styles.app} wrap={false}>
      <Text style={styles.appTitle}>
        {formatLagos(row.appliedAt)} · {row.greenhouseName} · {row.cycleCode}
      </Text>
      <Text style={styles.appMeta}>
        {row.cropName} {row.varietyName} · Operator: {row.operatorName} · Water:{" "}
        {pdfQty(row.waterVolumeLitres)} L
        {row.recipeName ? ` · Recipe: ${row.recipeName}` : ""}
        {row.notes ? ` · Notes: ${row.notes}` : ""}
      </Text>
      <LinesTable
        columns={[
          { header: "Product", flex: 3 },
          { header: "Active ingredient", flex: 2.6 },
          { header: "Batch", flex: 1.8 },
          { header: "Quantity", flex: 1.4, align: "right" },
          { header: "Rate / 1000 L", flex: 1.6, align: "right" },
          { header: "PHI (d)", flex: 1, align: "right" },
          { header: "REI (h)", flex: 1, align: "right" },
        ]}
        rows={
          row.products.length > 0
            ? row.products.map((p) => [
                p.name,
                p.activeIngredient ?? "—",
                p.batchNumbers.join(", "),
                `${pdfQty(p.quantity)} ${UNIT_LABELS[p.baseUnit]}`,
                `${pdfQty(p.ratePer1000L)} ${UNIT_LABELS[p.baseUnit]}`,
                p.phiDays === null ? "—" : String(p.phiDays),
                p.reiHours === null ? "—" : String(p.reiHours),
              ])
            : [["No products recorded", "", "", "", "", "", ""]]
        }
      />
      <View style={styles.safety}>
        <Text>
          <Text style={styles.label}>Entry-safe from: </Text>
          {row.entrySafeAt ? formatLagos(row.entrySafeAt) : "No REI"}
        </Text>
        <Text>
          <Text style={styles.label}>Harvest-safe from: </Text>
          {row.harvestSafeDate ? formatLagosDate(row.harvestSafeDate) : "No PHI"}
        </Text>
      </View>
      <Text style={styles.following}>
        <Text style={styles.label}>Harvests that followed: </Text>
        {row.following.length === 0
          ? "None recorded"
          : row.following.map((h, i) => (
              <Text key={h.harvestId} style={h.withinPhi ? styles.flag : undefined}>
                {i > 0 ? "; " : ""}
                {formatLagos(h.harvestedAt, "dd MMM yyyy HH:mm")} — {pdfQty(h.kg)} kg
                {h.withinPhi
                  ? h.phiOverride
                    ? ` [WITHIN PHI — manager override: ${h.phiOverrideReason ?? "no reason"}]`
                    : " [WITHIN PHI]"
                  : ""}
              </Text>
            ))}
      </Text>
    </View>
  );
}

export function SprayRecord({
  farm,
  range,
  rows,
  totalViolations,
  generatedAt,
}: {
  farm: FarmLetterhead;
  range: ReportRange;
  rows: SprayRecordRow[];
  totalViolations: number;
  generatedAt: Date;
}) {
  const period = `${formatLagosDate(range.from)} – ${formatLagosDate(range.to)}`;
  return (
    <Document title={`Spray record ${range.from} to ${range.to}`} author={farm.name}>
      <Page size="A4" orientation="landscape" style={docStyles.page}>
        <DocHeader
          farmName={farm.name}
          farmLines={[farm.siteName, farm.address]}
          title="SPRAY RECORD"
          number={period}
        />
        <MetaBlock
          left={[
            { label: "Period", value: period },
            { label: "Sprays", value: String(rows.length) },
          ]}
          right={[
            { label: "Generated", value: formatLagos(generatedAt) },
            {
              label: "Harvests inside a PHI window",
              value: String(totalViolations),
            },
          ]}
        />
        {rows.length === 0 ? (
          <Text style={styles.summary}>No sprays were recorded in this period.</Text>
        ) : (
          rows.map((r) => <SprayBlock key={r.applicationId} row={r} />)
        )}
        <NoteBox title="How to read this record">
          {`PHI/REI are the product label values captured when each spray was logged. Entry-safe = spray time + the longest REI; harvest-safe = spray date + the longest PHI (harvest is allowed on that date). Harvests in the same crop cycle are listed up to ${SPRAY_FOLLOW_UP_DAYS} days after the harvest-safe date; any harvest before it is flagged WITHIN PHI. All times Africa/Lagos.`}
        </NoteBox>
        <DocFooter text={`${farm.name} · Spray record ${period}`} />
      </Page>
    </Document>
  );
}
