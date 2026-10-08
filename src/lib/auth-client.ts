"use client";

import { createAuthClient } from "better-auth/react";
import {
  phoneNumberClient,
  organizationClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { ac, roles } from "./permissions";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [
    phoneNumberClient(),
    organizationClient({ ac, roles }),
    inferAdditionalFields<typeof auth>(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
