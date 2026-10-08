import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../lib/env";
import { assertSafeKey, type StorageAdapter } from "./types";

function resolveKey(key: string): string {
  assertSafeKey(key);
  const root = path.resolve(env.STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error(`Storage key escapes root: ${key}`);
  }
  return full;
}

export const localStorageAdapter: StorageAdapter = {
  async put(key, data, _contentType) {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { key };
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
  getUrl(key) {
    assertSafeKey(key);
    return `/api/uploads/${key}`;
  },
};
