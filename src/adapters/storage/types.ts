export interface StorageAdapter {
  put(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string,
  ): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  /** Always an app URL; /api/uploads streams via the adapter with auth checks. */
  getUrl(key: string): string;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

/** Reject traversal and junk keys before they reach any driver. */
export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}
