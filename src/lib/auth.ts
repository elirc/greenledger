import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { env, isMockAuth } from "./env";
import { ac, roles } from "./permissions";
import { sms } from "../adapters/sms";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      isPlatformAdmin: { type: "boolean", defaultValue: false, input: false },
    },
  },
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Default the active organization to the user's first membership.
          const result = await db.execute<{ organization_id: string }>(
            sql`select organization_id from member where user_id = ${session.userId} order by created_at asc limit 1`,
          );
          const orgId = result.rows[0]?.organization_id ?? null;
          return { data: { ...session, activeOrganizationId: orgId } };
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      sendOTP: async ({ phoneNumber: to, code }) => {
        if (isMockAuth) {
          console.log(`[mock:auth] OTP for ${to} is 123456`);
          return;
        }
        await sms.send({
          to,
          body: `Your GreenLedger verification code is ${code}. It expires in 5 minutes.`,
        });
      },
      // Mock mode: the OTP is always 123456 and no external call is made (spec).
      ...(isMockAuth
        ? { verifyOTP: async ({ code }: { code: string }) => code === "123456" }
        : {}),
      signUpOnVerification: {
        getTempEmail: (phone) =>
          `${phone.replace(/\D/g, "")}@phone.greenledger.local`,
        getTempName: (phone) => phone,
      },
    }),
    organization({
      ac,
      roles,
      creatorRole: "owner",
    }),
    // Must stay LAST so cookies set inside Server Actions work.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
