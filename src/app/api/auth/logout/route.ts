import {
  clearSessionCookie,
  currentSession,
  destroySession,
  sessionState,
} from "@/lib/session";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/logout
export async function POST() {
  try {
    const cur = await currentSession();
    if (cur) destroySession(cur.id);
    await clearSessionCookie();
    return json(sessionState(undefined));
  } catch (e) {
    return serverError(e);
  }
}
