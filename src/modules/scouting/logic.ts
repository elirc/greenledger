/** Pure helpers for scouting uploads (no db, no Next). */

import { PHOTO_EXT, type PhotoType } from "./schema";

/**
 * Identify an image from its magic bytes. The browser-declared mime type is
 * client-controlled, so the server trusts only this.
 */
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Storage key per brief: scouting/<orgId>/<uuid>.<ext>. */
export function scoutingPhotoKey(
  orgId: string,
  fileId: string,
  type: PhotoType,
): string {
  return `scouting/${orgId}/${fileId}.${PHOTO_EXT[type]}`;
}

/** Keep a readable original filename without path parts or control chars. */
export function safeFilename(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f"<>|]/g, "").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : fallback;
}
