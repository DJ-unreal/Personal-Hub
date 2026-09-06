import { currentSession } from "@/lib/session";
import { exchangeCode, redirectUri } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calendar/callback — Google redirects here with ?code&state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const done = (status: string) =>
    Response.redirect(`${origin}/?calendar=${status}`, 302);

  const cur = await currentSession();
  if (!cur) return Response.redirect(`${origin}/`, 302);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cur.session.oauthState;
  cur.session.oauthState = undefined; // one-time use

  if (url.searchParams.get("error")) return done("denied");
  if (!code || !state || !expected || state !== expected) return done("error");

  try {
    await exchangeCode(code, redirectUri(request));
    return done("connected");
  } catch {
    return done("error");
  }
}
