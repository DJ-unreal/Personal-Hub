import { requireAuth } from "@/lib/session";
import { NotConnectedError, todayEvents } from "@/lib/google";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calendar/events → today's events (deep-linked)
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    return json(await todayEvents());
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return json({ error: "Calendar not connected" }, 409);
    }
    return serverError(e);
  }
}
