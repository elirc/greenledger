import { parseQrPayload, type QrKind } from "@/lib/qr";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scanned/typed text → our payload. Label URLs go through parseQrPayload;
 * a bare UUID (typed from under the QR) is treated as a batch id.
 */
export function decodeScanText(
  text: string,
): { kind: QrKind; id: string } | null {
  const parsed = parseQrPayload(text);
  if (parsed) return parsed;
  const t = text.trim();
  if (UUID_RE.test(t)) return { kind: "batch", id: t.toLowerCase() };
  return null;
}
