import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Auto-login for local testing (AUTH_AUTOLOGIN). The (app) layout redirects
 * signed-out visitors here instead of /sign-in; we create a real Better Auth
 * session for a SEEDED demo account and bounce to the dashboard.
 *
 * Hard limits: disabled without the flag, and only the demo-farm accounts
 * (seed password) can be targeted — a deployment without Demo1234! seed
 * users gets nothing from this route even if the flag leaks in.
 */

const DEMO_PASSWORDS: Record<string, string> = {
  "admin@greenledger.local": "Admin1234!",
};
const DEMO_DOMAIN = "@demo.farm";
const DEFAULT_EMAIL = "owner@demo.farm";

export async function GET(request: Request) {
  const flag = env.AUTH_AUTOLOGIN;
  if (!flag) {
    return Response.json({ error: "DISABLED" }, { status: 404 });
  }

  const email = flag === "1" ? DEFAULT_EMAIL : flag.toLowerCase();
  const allowed =
    email.endsWith(DEMO_DOMAIN) || email in DEMO_PASSWORDS;
  if (!allowed) {
    return Response.json(
      { error: "AUTH_AUTOLOGIN only works with the seeded demo accounts" },
      { status: 403 },
    );
  }
  const password = DEMO_PASSWORDS[email] ?? "Demo1234!";

  console.warn(`[dev-login] auto-signing in as ${email} (AUTH_AUTOLOGIN)`);
  let setCookies: Headers;
  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    setCookies = headers;
  } catch {
    return Response.json(
      {
        error:
          "Demo account not found — run `pnpm db:seed`, then reload this page.",
      },
      { status: 500 },
    );
  }

  const to = new URL("/", request.url);
  const res = new Response(null, {
    status: 302,
    headers: { Location: to.toString() },
  });
  for (const cookie of setCookies.getSetCookie()) {
    res.headers.append("Set-Cookie", cookie);
  }
  return res;
}
