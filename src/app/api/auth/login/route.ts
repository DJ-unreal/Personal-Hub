import { verify } from "@node-rs/argon2";
import { secrets } from "@/lib/secrets";
import {
  createSession,
  destroySession,
  currentSession,
  sessionState,
  setSessionCookie,
} from "@/lib/session";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/login   { password }
export async function POST(request: Request) {
  try {
    const body = await readJson<{ password?: unknown }>(request);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) return badRequest("password is required");

    const ok = await verify(secrets.masterHash(), password).catch(() => false);
    if (!ok) return json({ error: "Incorrect password" }, 401);

    // Replace any prior session for this cookie, then issue a fresh one.
    const prev = await currentSession();
    if (prev) destroySession(prev.id);

    const id = createSession();
    await setSessionCookie(id);
    return json(sessionState({ unlocks: {}, createdAt: Date.now() }));
  } catch (e) {
    return serverError(e);
  }
}
