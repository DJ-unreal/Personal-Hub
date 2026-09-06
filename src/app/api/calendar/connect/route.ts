import { randomBytes } from "node:crypto";
import { currentSession } from "@/lib/session";
import { authUrl, isConfigured, redirectUri } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calendar/connect — start the OAuth flow (top-level browser nav).
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  // Browser navigation: on any problem, bounce back to the hub rather than
  // returning JSON.
  const cur = await currentSession();
  if (!cur) return Response.redirect(`${origin}/`, 302);
  if (!isConfigured()) {
    return Response.redirect(`${origin}/?calendar=unconfigured`, 302);
  }

  const state = randomBytes(16).toString("base64url");
  cur.session.oauthState = state;
  return Response.redirect(authUrl(state, redirectUri(request)), 302);
}
