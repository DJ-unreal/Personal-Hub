import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { currentSession, requireOpenModule } from "@/lib/session";
import { resolveDoc } from "@/lib/healthDocs";
import { isMailConfigured, isValidEmail, mailFrom } from "@/lib/mailer";
import { badRequest, json, notFound, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/health-docs/:id/email   { to }
   STEP 1 of 2 — PREPARES a send and returns exactly what would go out.
   Sends nothing. The caller must then POST the returned token to
   /api/health-docs/email/confirm. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/health-docs/[id]/email">,
) {
  try {
    const guard = await requireOpenModule("health");
    if (guard instanceof Response) return guard;
    if (!isMailConfigured()) {
      return json({ error: "Email is not configured" }, 503);
    }

    const { id } = await ctx.params;
    const doc = resolveDoc(id);
    if (!doc) return notFound("Document not found");

    const body = await readJson<{ to?: unknown }>(request);
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    if (!to) return badRequest("recipient is required");
    if (!isValidEmail(to)) return badRequest("that doesn't look like an email address");

    const cur = await currentSession();
    if (!cur) return json({ error: "Not authenticated" }, 401);

    const token = randomBytes(24).toString("base64url");
    cur.session.pendingEmail = {
      token,
      docId: id,
      filename: doc.filename,
      to,
      createdAt: Date.now(),
    };

    // Echo back precisely what a confirmation would send.
    return json({
      token,
      filename: doc.filename,
      size: statSync(doc.filePath).size,
      to,
      from: mailFrom(),
    });
  } catch (e) {
    return serverError(e);
  }
}
