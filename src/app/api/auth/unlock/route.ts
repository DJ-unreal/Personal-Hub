import { verify } from "@node-rs/argon2";
import { secrets } from "@/lib/secrets";
import {
  currentSession,
  sessionState,
  unlockModule,
} from "@/lib/session";
import { PROTECTED_MODULES, type ProtectedModule } from "@/lib/types";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isModule(v: unknown): v is ProtectedModule {
  return typeof v === "string" && (PROTECTED_MODULES as string[]).includes(v);
}

// POST /api/auth/unlock   { module, passcode }
export async function POST(request: Request) {
  try {
    const cur = await currentSession();
    if (!cur) return json({ error: "Not authenticated" }, 401);

    const body = await readJson<{ module?: unknown; passcode?: unknown }>(
      request,
    );
    if (!isModule(body?.module)) return badRequest("unknown module");
    const passcode =
      typeof body?.passcode === "string" ? body.passcode : "";
    if (!passcode) return badRequest("passcode is required");

    const ok = await verify(
      secrets.passcodeHash(body.module),
      passcode,
    ).catch(() => false);
    if (!ok) return json({ error: "Incorrect passcode" }, 401);

    unlockModule(cur.session, body.module);
    return json(sessionState(cur.session));
  } catch (e) {
    return serverError(e);
  }
}
