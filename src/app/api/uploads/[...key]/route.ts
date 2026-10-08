import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { storage } from "@/adapters/storage";

/** Serves stored files (scouting photos, …) with org-scoped auth. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  let ctx;
  try {
    ctx = await requireMember();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.code }, { status: 403 });
    }
    throw e;
  }

  const { key } = await params;
  const storageKey = key.join("/");

  const file = await db.query.files.findFirst({
    where: and(
      eq(files.organisationId, ctx.orgId),
      eq(files.storageKey, storageKey),
    ),
  });
  if (!file) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const data = await storage.get(storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
