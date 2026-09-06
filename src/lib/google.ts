import { getDb, newId } from "@/lib/db";
import { decryptJSON, encryptJSON } from "@/lib/crypto";
import type { CalendarAccount, CalendarEvent } from "@/lib/types";

/* =====================================================================
   Google Calendar (read-only) — OAuth2 authorization-code flow via plain
   fetch (no SDK).

   MULTIPLE ACCOUNTS: each connected Google account is a row in
   `calendar_accounts`, with its tokens AES-256-GCM encrypted. Today's
   agenda queries every account in parallel and merges the results in time
   order, so a personal and a work calendar appear as one list.

   The account's email is read from the primary calendar's id, which the
   calendar.readonly scope already provides — no extra consent needed.
   ===================================================================== */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export class NotConnectedError extends Error {}

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry: number; // epoch ms
  scope?: string;
  token_type?: string;
}

interface AccountRow {
  id: string;
  email: string;
  enc: string;
  created_at: number;
}

/* ------------------------------- config -------------------------------- */
export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }
  return { clientId, clientSecret };
}

/** The OAuth redirect URI — env override, else derived from the request. */
export function redirectUri(request: Request): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${new URL(request.url).origin}/api/calendar/callback`
  );
}

/* ------------------------------ account store -------------------------- */
function rows(): AccountRow[] {
  return getDb()
    .prepare("SELECT * FROM calendar_accounts ORDER BY created_at ASC")
    .all() as unknown as AccountRow[];
}

export function listAccounts(): CalendarAccount[] {
  return rows().map((r) => ({ id: r.id, email: r.email }));
}

export function isConnected(): boolean {
  return rows().length > 0;
}

export function removeAccount(id: string): boolean {
  return (
    getDb().prepare("DELETE FROM calendar_accounts WHERE id = ?").run(id)
      .changes > 0
  );
}

/** Remove every connected account. */
export function disconnectAll(): void {
  getDb().prepare("DELETE FROM calendar_accounts").run();
}

function saveTokensFor(id: string, t: GoogleTokens): void {
  getDb()
    .prepare("UPDATE calendar_accounts SET enc = ? WHERE id = ?")
    .run(encryptJSON(t), id);
}

function setEmail(id: string, email: string): void {
  getDb()
    .prepare("UPDATE calendar_accounts SET email = ? WHERE id = ?")
    .run(email, id);
}

/* ------------------------------ oauth flow ----------------------------- */
export function authUrl(state: string, redirect: string): string {
  const { clientId } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // request a refresh token
    // select_account forces the chooser, so a SECOND account can be added
    // rather than silently re-authorising the one already signed in.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the code, identify the account, and store (or update) it. */
export async function exchangeCode(
  code: string,
  redirect: string,
): Promise<void> {
  const { clientId, clientSecret } = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };
  if (!data.refresh_token) {
    throw new Error("No refresh token returned — revoke access and retry");
  }

  const tokens: GoogleTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type,
  };

  // Identify which account this is, so reconnecting updates rather than
  // duplicates, and so the UI can label it.
  const email = await fetchPrimaryEmail(tokens.access_token).catch(() => "");

  const db = getDb();
  const existing = email
    ? (db
        .prepare("SELECT id FROM calendar_accounts WHERE email = ?")
        .get(email) as { id: string } | undefined)
    : undefined;

  if (existing) {
    saveTokensFor(existing.id, tokens);
  } else {
    db.prepare(
      "INSERT INTO calendar_accounts (id, email, enc, created_at) VALUES (?, ?, ?, ?)",
    ).run(newId(), email, encryptJSON(tokens), Date.now());
  }
}

/** The primary calendar's id is the account's email address. */
async function fetchPrimaryEmail(accessToken: string): Promise<string> {
  const res = await fetch(CAL_BASE, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}

/** Valid access token for one account, refreshing in place if needed. */
async function validAccessToken(row: AccountRow): Promise<string> {
  const tokens = decryptJSON<GoogleTokens>(row.enc);
  if (Date.now() < tokens.expiry - 60_000) return tokens.access_token;

  const { clientId, clientSecret } = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
  const next: GoogleTokens = {
    ...tokens,
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? tokens.scope,
  };
  saveTokensFor(row.id, next);
  return next.access_token;
}

/* ------------------------------ events --------------------------------- */
interface RawEvent {
  id?: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
}

async function eventsForAccount(
  row: AccountRow,
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const token = await validAccessToken(row);

  // Backfill the email for accounts migrated from the single-account store.
  let email = row.email;
  if (!email) {
    email = await fetchPrimaryEmail(token).catch(() => "");
    if (email) setEmail(row.id, email);
  }

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });
  const res = await fetch(`${CAL_BASE}/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar API error (${res.status})`);
  const data = (await res.json()) as { items?: RawEvent[] };

  return (data.items ?? []).map((ev, i) => {
    const allDay = !ev.start?.dateTime;
    const startsAt = allDay
      ? new Date(`${ev.start?.date}T00:00:00`).getTime()
      : new Date(ev.start!.dateTime!).getTime();
    return {
      id: `${row.id}:${ev.id ?? i}`,
      time: allDay
        ? "All day"
        : new Date(ev.start!.dateTime!).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      name: ev.summary ?? "(no title)",
      url: ev.htmlLink ?? "https://calendar.google.com/",
      allDay,
      accountEmail: email,
      startsAt,
    };
  });
}

/** Today's events across every connected account, merged in time order. */
export async function todayEvents(): Promise<CalendarEvent[]> {
  const accounts = rows();
  if (accounts.length === 0) throw new NotConnectedError("No account connected");

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // One failing account must not blank the whole agenda.
  const results = await Promise.allSettled(
    accounts.map((a) => eventsForAccount(a, start, end)),
  );
  const events = results.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[calendar] account fetch failed:", r.reason?.message);
    return [];
  });

  if (events.length === 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("Couldn't reach Google Calendar");
  }

  return events.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt - b.startsAt,
  );
}
