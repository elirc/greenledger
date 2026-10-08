/**
 * QR payloads are plain URLs so any phone camera app can open them:
 *   <APP_URL>/scan?t=<batch|lot|equip>&id=<uuid>
 * parseQrPayload is pure and runs client-side (the scan page).
 */

export type QrKind = "batch" | "lot" | "equip";

const KINDS: QrKind[] = ["batch", "lot", "equip"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildQrUrl(kind: QrKind, id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/scan?t=${kind}&id=${id}`;
}

/** Accepts any origin (old labels keep working after a domain move). */
export function parseQrPayload(
  text: string,
): { kind: QrKind; id: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (!url.pathname.endsWith("/scan")) return null;
  const kind = url.searchParams.get("t") as QrKind | null;
  const id = url.searchParams.get("id");
  if (!kind || !KINDS.includes(kind)) return null;
  if (!id || !UUID_RE.test(id)) return null;
  return { kind, id };
}
