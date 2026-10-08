import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

/** 48×25mm labels, 4×11 grid on A4 — mm → pt (×2.8346). */
const MM = 2.8346;

const styles = StyleSheet.create({
  page: {
    paddingVertical: 10 * MM,
    paddingHorizontal: 6 * MM,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  label: {
    width: 48 * MM,
    height: 25 * MM,
    padding: 1.5 * MM,
    margin: 0.75 * MM,
    borderWidth: 0.5,
    borderColor: "#bbbbbb",
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  qr: { width: 20 * MM, height: 20 * MM, marginRight: 1.5 * MM },
  text: { flex: 1, flexDirection: "column" },
  name: { fontSize: 7, fontFamily: "Helvetica-Bold", marginBottom: 1.5 },
  line: { fontSize: 6, marginBottom: 1 },
  expiry: { fontSize: 6.5, fontFamily: "Helvetica-Bold" },
});

export interface LabelData {
  /** data: URL of the QR code PNG. */
  qrDataUrl: string;
  itemName: string;
  batchNumber: string;
  /** Preformatted 'Exp 12 Jan 2027' or 'No expiry'. */
  expiryText: string;
  unitLabel: string;
}

export function LabelSheet({ labels }: { labels: LabelData[] }) {
  return (
    <Document title="GreenLedger batch labels">
      <Page size="A4" style={styles.page}>
        {labels.map((l, i) => (
          <View key={i} style={styles.label} wrap={false}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={l.qrDataUrl} style={styles.qr} />
            <View style={styles.text}>
              <Text style={styles.name}>{truncate(l.itemName, 48)}</Text>
              <Text style={styles.line}>Batch {truncate(l.batchNumber, 24)}</Text>
              <Text style={styles.line}>Unit: {l.unitLabel}</Text>
              <Text style={styles.expiry}>{l.expiryText}</Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
