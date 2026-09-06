import { macros } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/macros/past → distinct previously-logged foods, newest first
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    return json(macros.pastEntries(12));
  } catch (e) {
    return serverError(e);
  }
}
