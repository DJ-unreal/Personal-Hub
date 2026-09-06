import {
  currentSession,
  lockAll,
  lockModule,
  sessionState,
} from "@/lib/session";
import { PROTECTED_MODULES, type ProtectedModule } from "@/lib/types";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isModule(v: unknown): v is ProtectedModule {
  return typeof v === "string" && (PROTECTED_MODULES as string[]).includes(v);
}

// POST /api/auth/lock   { module } | { all: true }
export async function POST(request: Request) {
  try {
    const cur = await currentSession();
    if (!cur) return json({ error: "Not authenticated" }, 401);

    const body = await readJson<{ module?: unknown; all?: unknown }>(request);
    if (body?.all === true) {
      lockAll(cur.session);
    } else if (isModule(body?.module)) {
      lockModule(cur.session, body.module);
    } else {
      return badRequest("provide { module } or { all: true }");
    }
    return json(sessionState(cur.session));
  } catch (e) {
    return serverError(e);
  }
}
