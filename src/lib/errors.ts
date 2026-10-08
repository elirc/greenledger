/** Expected business-rule failure. Mapped to ActionResult by defineAction. */
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NO_ORG"
  | "READ_ONLY";

const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  UNAUTHENTICATED: "You need to sign in.",
  FORBIDDEN: "You do not have permission to do that.",
  NO_ORG: "Your account is not part of a farm yet.",
  READ_ONLY:
    "This farm is read-only (trial ended or payment overdue). Data is safe; renew to make changes.",
};

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? AUTH_MESSAGES[code]);
    this.name = "AuthError";
  }
}
