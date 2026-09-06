import { requireAuth } from "@/lib/session";
import { disconnectAll, removeAccount } from "@/lib/google";
import { json, notFound, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/calendar/disconnect   { id }        → disconnect one account
   POST /api/calendar/disconnect   { all: true } → disconnect every account
   (an empty body also means "all", preserving the original behaviour) */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;

    const body = await readJson<{ id?: unknown; all?: unknown }>(request);
    if (body && typeof body.id === "string" && body.id) {
      return removeAccount(body.id)
        ? json({ ok: true })
        : notFound("Account not found");
    }

    disconnectAll();
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
