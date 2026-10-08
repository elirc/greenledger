import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { session, user } from "../schema";
import { bump, type SeedState } from "./state";

export interface SeedUserInput {
  label: string;
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
}

/**
 * Create an email+password user through Better Auth's own server API so the
 * credential hash is exactly what sign-in expects, then patch the columns the
 * sign-up body cannot set (phone, verification flags). Returns the user id.
 */
export async function createAuthUser(
  state: SeedState,
  input: SeedUserInput,
): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
  });
  const userId = res.user.id;

  await state.db
    .update(user)
    .set({
      name: input.name,
      emailVerified: true,
      phoneNumber: input.phoneNumber ?? null,
      phoneNumberVerified: input.phoneNumber ? true : null,
    })
    .where(eq(user.id, userId));

  // signUpEmail auto-signs-in; drop the throwaway session it created.
  await state.db.delete(session).where(eq(session.userId, userId));

  state.logins.push({
    label: input.label,
    email: input.email,
    password: input.password,
    phoneNumber: input.phoneNumber ?? null,
  });
  bump(state, "user");
  return userId;
}
