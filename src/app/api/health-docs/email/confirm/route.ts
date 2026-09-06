import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import {
  EMAIL_CONFIRM_MS,
  currentSession,
  requireOpenModule,
} from "@/lib/session";
import { contentTypeFor, resolveDoc } from "@/lib/healthDocs";
import { describeMailError, isMailConfigured, sendDocument } from "@/lib/mailer";
import { badRequest, json, notFound, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* POST /api/health-docs/email/confirm   { token }
   STEP 2 of 2 — the only path that actually sends. Requires a token
   issued by the prepare step in THIS session; single-use and expiring. */
export async function POST(request: Request) {
  try {
    const guard = await requireOpenModule("health");
    if (guard instanceof Response) return guard;
    if (!isMailConfigured()) {
      return json({ error: "Email is not configured" }, 503);
    }

    const cur = await currentSession();
    if (!cur) return json({ error: "Not authenticated" }, 401);

    const body = await readJson<{ token?: unknown }>(request);
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) return badRequest("token is required");

    const pending = cur.session.pendingEmail;
    if (!pending || !tokensMatch(token, pending.token)) {
      return badRequest("No matching send is awaiting confirmation");
    }

    // Burn the token first: a failed send must not leave it replayable.
    cur.session.pendingEmail = undefined;

    if (Date.now() - pending.createdAt > EMAIL_CONFIRM_MS) {
      return badRequest("Confirmation expired — prepare the send again");
    }

    const doc = resolveDoc(pending.docId);
    if (!doc) return notFound("Document not found");

    const { type } = contentTypeFor(doc.ext);
    try {
      await sendDocument({
        to: pending.to,
        filename: doc.filename,
        content: readFileSync(doc.filePath),
        contentType: type,
      });
    } catch (sendErr) {
      console.error("[api] health-doc email send failed:", sendErr);
      return json({ error: describeMailError(sendErr) }, 502);
    }

    return json({ sent: true, to: pending.to, filename: doc.filename });
  } catch (e) {
    return serverError(e);
  }
}
