import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../../lib/env";
import { assertSafeKey, type StorageAdapter } from "./types";

let client: S3Client | null = null;

function s3(): S3Client {
  client ??= new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

export const s3StorageAdapter: StorageAdapter = {
  async put(key, data, contentType) {
    assertSafeKey(key);
    await s3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    return { key };
  },
  async get(key) {
    assertSafeKey(key);
    const res = await s3().send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    if (!res.Body) throw new Error(`S3 object has no body: ${key}`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  },
  getUrl(key) {
    assertSafeKey(key);
    // Served through the app so auth is enforced even for private buckets.
    return `/api/uploads/${key}`;
  },
};
