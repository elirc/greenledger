import { z } from "zod";
import { ROLES } from "@/lib/permissions";

/* ------------------------------------------------------------------ */
/* Phone helpers (pure — unit-test friendly, safe in client bundles)   */
/* ------------------------------------------------------------------ */

/**
 * Normalize a Nigerian mobile number to E.164 (`+234XXXXXXXXXX`).
 * Accepts `0803 123 4567`, `803 123 4567`, `2348031234567`, `+234 803 123 4567`
 * (spaces, dashes, dots and brackets ignored) and the common `+2340803…` typo.
 * Returns null when the input is not a Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+234\d+$/.test(cleaned)) national = cleaned.slice(4);
  else if (/^234\d{10,11}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^0\d{10}$/.test(cleaned)) national = cleaned.slice(1);
  else if (/^\d{10}$/.test(cleaned)) national = cleaned;
  else return null;
  // Trunk zero typed after the country code (+2340803…) — drop it.
  if (/^0\d{10}$/.test(national)) national = national.slice(1);
  // Nigerian mobile ranges: 070x/080x/081x/090x/091x (national, without trunk 0).
  if (!/^[789][01]\d{8}$/.test(national)) return null;
  return `+234${national}`;
}

/** `+2348031234567` → `+234 803 123 4567` (falls back to the raw value). */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Placeholder email for phone-only users — same format Better Auth's
 * phoneNumber plugin uses (`signUpOnVerification.getTempEmail`). */
export function tempEmailForPhone(e164: string): string {
  return `${e164.replace(/\D/g, "")}@phone.greenledger.local`;
}

export function isTempPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith("@phone.greenledger.local"));
}

/** True when the URL's host is a local dev host (mock OTP hint). */
export function isLocalDevUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Auth screens                                                        */
/* ------------------------------------------------------------------ */

export const phoneField = z
  .string()
  .trim()
  .min(1, "Enter your phone number")
  .refine((v) => normalizeNigerianPhone(v) !== null, {
    error: "Enter a Nigerian mobile number, e.g. 0803 123 4567",
  });

export const signInPhoneSchema = z.object({ phone: phoneField });

export const signInEmailSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const verifyOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type SignInPhoneInput = z.infer<typeof signInPhoneSchema>;
export type SignInEmailInput = z.infer<typeof signInEmailSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/* ------------------------------------------------------------------ */
/* Staff management                                                    */
/* ------------------------------------------------------------------ */

export const roleSchema = z.enum(ROLES, { error: "Choose a role" });

/** Member ids are Better Auth text ids (UUID values, but not guaranteed). */
const memberIdField = z.string().trim().min(1).max(64);

/** Role + greenhouse access — the editable part of a membership. */
export const staffAccessSchema = z.object({
  role: roleSchema,
  /** Only meaningful for workers; ignored (cleared) for other roles. */
  greenhouseIds: z.array(z.uuid()).max(500),
});

/** Shared between the add-staff form (zodResolver) and `createStaff`. */
export const staffCreateSchema = staffAccessSchema.extend({
  name: z.string().trim().min(2, "Name is too short").max(120),
  phone: phoneField,
});

export const staffUpdateSchema = staffAccessSchema.extend({
  memberId: memberIdField,
});

export const staffRemoveSchema = z.object({ memberId: memberIdField });

export type StaffAccessInput = z.infer<typeof staffAccessSchema>;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type StaffRemoveInput = z.infer<typeof staffRemoveSchema>;
