import { z } from "zod";
import { AuthError, DomainError } from "./errors";
import { assertWritable, requireMember, type Ctx } from "./guard";
import type { Role } from "./permissions";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code: string;
      fieldErrors?: Record<string, string[]>;
    };

/** Rethrow Next.js control-flow errors (redirect/notFound) untouched. */
function isNextControlFlow(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (e as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  );
}

/**
 * Canonical Server Action wrapper: zod → guard → read-only check → handler →
 * error mapping. Handlers throw DomainError for business failures and run
 * their own db.transaction. Results must be JSON-serializable.
 */
export function defineAction<S extends z.ZodType, T>(cfg: {
  /** Audit-style action name, e.g. 'store.issueStock'. */
  name: string;
  schema: S;
  roles?: Role[];
  allowReadOnly?: boolean;
  handler: (input: z.infer<S>, ctx: Ctx) => Promise<T>;
}): (raw: unknown) => Promise<ActionResult<T>> {
  return async function run(raw: unknown): Promise<ActionResult<T>> {
    try {
      const parsed = cfg.schema.safeParse(raw);
      if (!parsed.success) {
        const flat = z.flattenError(parsed.error);
        return {
          ok: false,
          code: "VALIDATION",
          error: "Please check the highlighted fields.",
          fieldErrors: flat.fieldErrors as Record<string, string[]>,
        };
      }
      const ctx = await requireMember(
        cfg.roles ? { roles: cfg.roles } : undefined,
      );
      if (!cfg.allowReadOnly) assertWritable(ctx);
      const data = await cfg.handler(parsed.data as z.infer<S>, ctx);
      return { ok: true, data };
    } catch (e) {
      if (isNextControlFlow(e)) throw e;
      if (e instanceof DomainError) {
        return { ok: false, code: e.code, error: e.message };
      }
      if (e instanceof AuthError) {
        return { ok: false, code: e.code, error: e.message };
      }
      console.error(`[action:${cfg.name}]`, e);
      return {
        ok: false,
        code: "INTERNAL",
        error: "Something went wrong. Please try again.",
      };
    }
  };
}
