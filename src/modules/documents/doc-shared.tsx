import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatNaira } from "@/lib/money";

/**
 * Shared react-pdf primitives for A4 business documents (delivery note,
 * invoice): DocHeader, MetaBlock, LinesTable, SignatureBlock, money.
 * PDFs are owner/manager-only, so money is allowed here.
 */

const GREEN = "#1f6f43";
const MUTED = "#666666";
const RULE = "#cccccc";

export const docStyles = StyleSheet.create({
  page: {
    paddingVertical: 36,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    paddingBottom: 10,
    marginBottom: 14,
  },
  farmName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GREEN },
  farmLine: { fontSize: 9, color: MUTED, marginTop: 2 },
  docTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  docNumber: { fontSize: 11, textAlign: "right", marginTop: 3 },
  metaRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
  metaCol: { flex: 1 },
  metaLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaValue: { fontSize: 10, marginBottom: 6 },
  table: { borderTopWidth: 1, borderTopColor: RULE },
  th: {
    flexDirection: "row",
    backgroundColor: "#f1f5f2",
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingVertical: 5,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 5,
  },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 9, paddingHorizontal: 4 },
  td: { fontSize: 10, paddingHorizontal: 4 },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { color: MUTED },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  note: {
    marginTop: 18,
    padding: 8,
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 2,
  },
  noteTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 3 },
  signatures: { flexDirection: "row", gap: 24, marginTop: 40 },
  sigBox: { flex: 1 },
  sigLine: {
    borderBottomWidth: 0.75,
    borderBottomColor: "#333333",
    height: 28,
    marginBottom: 4,
  },
  sigLabel: { fontSize: 9, color: MUTED },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
  },
});

/**
 * Naira for PDFs. The built-in Helvetica has no ₦ glyph (WinAnsi), so the
 * symbol is spelled "NGN".
 */
export function pdfNaira(kobo: number | null | undefined): string {
  return formatNaira(kobo).replace("₦", "NGN ").replace(/\s+/g, " ").trim();
}

const qtyFormat = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });
export function pdfQty(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : qtyFormat.format(n);
}

export function DocHeader({
  farmName,
  farmLines,
  title,
  number,
}: {
  farmName: string;
  /** Site name, address — empty entries are skipped. */
  farmLines: (string | null | undefined)[];
  title: string;
  number: string;
}) {
  return (
    <View style={docStyles.header} fixed>
      <View>
        <Text style={docStyles.farmName}>{farmName}</Text>
        {farmLines.filter(Boolean).map((l, i) => (
          <Text key={i} style={docStyles.farmLine}>
            {l}
          </Text>
        ))}
      </View>
      <View>
        <Text style={docStyles.docTitle}>{title}</Text>
        <Text style={docStyles.docNumber}>{number}</Text>
      </View>
    </View>
  );
}

export interface MetaItem {
  label: string;
  value: string | null | undefined;
}

/** Two columns of label/value pairs (customer on the left, dates on the right). */
export function MetaBlock({
  left,
  right,
}: {
  left: MetaItem[];
  right: MetaItem[];
}) {
  const col = (items: MetaItem[]) => (
    <View style={docStyles.metaCol}>
      {items
        .filter((m) => m.value)
        .map((m, i) => (
          <View key={i}>
            <Text style={docStyles.metaLabel}>{m.label}</Text>
            <Text style={docStyles.metaValue}>{m.value}</Text>
          </View>
        ))}
    </View>
  );
  return (
    <View style={docStyles.metaRow}>
      {col(left)}
      {col(right)}
    </View>
  );
}

export interface LinesColumn {
  header: string;
  /** flex weight */
  flex: number;
  align?: "left" | "right";
}

/** Simple ruled table; `rows` are preformatted strings per column. */
export function LinesTable({
  columns,
  rows,
}: {
  columns: LinesColumn[];
  rows: string[][];
}) {
  return (
    <View style={docStyles.table}>
      <View style={docStyles.th} fixed>
        {columns.map((c, i) => (
          <Text
            key={i}
            style={[
              docStyles.thText,
              { flex: c.flex, textAlign: c.align ?? "left" },
            ]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={docStyles.tr} wrap={false}>
          {columns.map((c, ci) => (
            <Text
              key={ci}
              style={[docStyles.td, { flex: c.flex, textAlign: c.align ?? "left" }]}
            >
              {r[ci] ?? ""}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function TotalsBlock({
  rows,
}: {
  rows: { label: string; value: string; grand?: boolean }[];
}) {
  return (
    <View style={docStyles.totals} wrap={false}>
      {rows.map((r, i) => (
        <View key={i} style={docStyles.totalRow}>
          <Text style={r.grand ? docStyles.grandLabel : docStyles.totalLabel}>
            {r.label}
          </Text>
          <Text style={r.grand ? docStyles.grandValue : undefined}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function NoteBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={docStyles.note} wrap={false}>
      <Text style={docStyles.noteTitle}>{title}</Text>
      <Text>{children}</Text>
    </View>
  );
}

export function SignatureBlock({ labels }: { labels: string[] }) {
  return (
    <View style={docStyles.signatures} wrap={false}>
      {labels.map((l, i) => (
        <View key={i} style={docStyles.sigBox}>
          <View style={docStyles.sigLine} />
          <Text style={docStyles.sigLabel}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export function DocFooter({ text }: { text: string }) {
  return (
    <Text
      style={docStyles.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${text} · Page ${pageNumber} of ${totalPages}`
      }
    />
  );
}
