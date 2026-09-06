import { currentSession, sessionState } from "@/lib/session";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/session  → { authed, modules: { budget, health } }
export async function GET() {
  try {
    const cur = await currentSession();
    return json(sessionState(cur?.session));
  } catch (e) {
    return serverError(e);
  }
}
