import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@localhost:5432/greenledger_dev"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  AUTH_MOCK: z.enum(["0", "1"]).default("0"),
  /**
   * Local-testing convenience: skip the sign-in screen entirely. "1" signs
   * in as the demo owner; an email picks another SEEDED demo account. The
   * dev-login route only accepts @demo.farm / admin@greenledger.local
   * accounts, so this cannot log into real users. Never set in a deployment.
   */
  AUTH_AUTOLOGIN: z.string().optional(),
  ADAPTER_SMS: z.enum(["mock", "termii"]).default("mock"),
  ADAPTER_EMAIL: z.enum(["mock", "resend"]).default("mock"),
  ADAPTER_PAYMENTS: z.enum(["mock", "paystack"]).default("mock"),
  ADAPTER_STORAGE: z.enum(["local", "s3"]).default("local"),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("GreenLedger"),
  TERMII_CHANNEL: z.enum(["generic", "dnd"]).default("dnd"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("no-reply@greenledger.example"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  STORAGE_DIR: z.string().default("./storage"),
  PGBOSS_SCHEMA: z.string().default("pgboss"),
});

export const env = schema.parse(process.env);

export const isMockAuth = env.AUTH_MOCK === "1";

// The app must refuse to START in production with mock auth enabled (spec
// rule). `next build` also runs with NODE_ENV=production while collecting
// page data — building is allowed; serving is not.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && isMockAuth && !isBuildPhase) {
  throw new Error(
    "FATAL: AUTH_MOCK=1 in production. GreenLedger refuses to start with mock auth enabled.",
  );
}

// Real drivers need their credentials at startup, not at first use.
if (env.ADAPTER_SMS === "termii" && !env.TERMII_API_KEY) {
  throw new Error("ADAPTER_SMS=termii requires TERMII_API_KEY");
}
if (env.ADAPTER_EMAIL === "resend" && !env.RESEND_API_KEY) {
  throw new Error("ADAPTER_EMAIL=resend requires RESEND_API_KEY");
}
if (env.ADAPTER_PAYMENTS === "paystack" && !env.PAYSTACK_SECRET_KEY) {
  throw new Error("ADAPTER_PAYMENTS=paystack requires PAYSTACK_SECRET_KEY");
}
if (
  env.ADAPTER_STORAGE === "s3" &&
  (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
) {
  throw new Error(
    "ADAPTER_STORAGE=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
  );
}
