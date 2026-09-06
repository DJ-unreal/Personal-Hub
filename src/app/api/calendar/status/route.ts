import { requireAuth } from "@/lib/session";
import { isConfigured, listAccounts } from "@/lib/google";
import { json, serverError } from "@/lib/http";
import type { CalendarStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calendar/status → { configured, connected }
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const configured = isConfigured();
    const accounts = configured ? listAccounts() : [];
    const status: CalendarStatus = {
      configured,
      connected: accounts.length > 0,
      accounts,
    };
    return json(status);
  } catch (e) {
    return serverError(e);
  }
}
