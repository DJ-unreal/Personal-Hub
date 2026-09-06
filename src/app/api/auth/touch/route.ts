import { currentSession, sessionState, touchModule } from "@/lib/session";
import { PROTECTED_MODULES, type ProtectedModule } from "@/lib/types";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isModule(v: unknown): v is ProtectedModule {
  return typeof v === "string" && (PROTECTED_MODULES as string[]).includes(v);
}

// POST /api/auth/touch   { module }   — reset the idle timer on activity
export async function POST(request: Request) {
  try {
    const cur = await currentSession();
    if (!cur) return json({ error: "Not authenticated" }, 401);

    const body = await readJson<{ module?: unknown }>(request);
    if (!isModule(body?.module)) return badRequest("unknown module");

    touchModule(cur.session, body.module);
    return json(sessionState(cur.session));
  } catch (e) {
    return serverError(e);
  }
}
