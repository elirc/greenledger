import { env } from "../../lib/env";
import { localStorageAdapter } from "./local";
import { s3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

export const storage: StorageAdapter =
  env.ADAPTER_STORAGE === "s3" ? s3StorageAdapter : localStorageAdapter;

export { assertSafeKey } from "./types";
export type { StorageAdapter } from "./types";
