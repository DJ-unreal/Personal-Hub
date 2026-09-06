import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { sign, unsign } from "@/lib/crypto";
import type {
  ModuleLockState,
  ProtectedModule,
  SessionState,
} from "@/lib/types";
import { PROTECTED_MODULES } from "@/lib/types";

/* =====================================================================
   Session store + cookie (server-only).

   Sessions live in-memory, keyed by an opaque 256-bit id carried in an
   HMAC-signed httpOnly cookie. The store resets on server restart — a
   safe default for a self-hosted single-user app (everything relocks).

   Per-module unlocks are tracked as a last-activity timestamp; a module
   is "open" while it's been touched within RELOCK_MS. Any protected
   access bumps the timestamp, so the idle timer resets on activity.
   ===================================================================== */

const COOKIE = "hub_session";
const RELOCK_MS = 5 * 60 * 1000; // 5 min idle → auto-relock

interface Session {
  unlocks: Partial<Record<ProtectedModule, number>>; // last-activity ms
  createdAt: number;
  oauthState?: string; // CSRF token for the in-flight Google OAuth redirect
  /* A health-document email that has been PREPARED but not yet confirmed.
     Held server-side so the "are you sure" step cannot be skipped by
     calling the send endpoint directly. Single-use, short-lived. */
  pendingEmail?: {
    token: string;
    docId: string;
    filename: string;
    to: string;
    createdAt: number;
  };
}

/** How long a prepared email stays confirmable. */
export const EMAIL_CONFIRM_MS = 2 * 60 * 1000;

const globalForSessions = globalThis as unknown as {
  __hubSessions?: Map<string, Session>;
};
function store(): Map<string, Session> {
  return (globalForSessions.__hubSessions ??= new Map());
}

/* ------------------------------ lifecycle ------------------------------ */
export function createSession(): string {
  const id = randomBytes(32).toString("base64url");
  store().set(id, { unlocks: {}, createdAt: Date.now() });
  return id;
}
export function destroySession(id: string): void {
  store().delete(id);
}

/* ------------------------------ unlock state --------------------------- */
export function moduleOpen(s: Session, m: ProtectedModule): boolean {
  const t = s.unlocks[m];
  return t != null && Date.now() - t < RELOCK_MS;
}
export function secsLeft(s: Session, m: ProtectedModule): number {
  const t = s.unlocks[m];
  if (t == null) return 0;
  return Math.max(0, Math.ceil((RELOCK_MS - (Date.now() - t)) / 1000));
}
export function unlockModule(s: Session, m: ProtectedModule): void {
  s.unlocks[m] = Date.now();
}
export function touchModule(s: Session, m: ProtectedModule): void {
  if (moduleOpen(s, m)) s.unlocks[m] = Date.now();
}
export function lockModule(s: Session, m: ProtectedModule): void {
  delete s.unlocks[m];
}
export function lockAll(s: Session): void {
  s.unlocks = {};
}

export function sessionState(s: Session | undefined): SessionState {
  const mod = (m: ProtectedModule): ModuleLockState =>
    s ? { open: moduleOpen(s, m), secsLeft: secsLeft(s, m) } : { open: false, secsLeft: 0 };
  return {
    authed: !!s,
    modules: PROTECTED_MODULES.reduce(
      (acc, m) => ({ ...acc, [m]: mod(m) }),
      {} as Record<ProtectedModule, ModuleLockState>,
    ),
  };
}

/* ------------------------------ cookie / lookup ------------------------ */
export async function currentSession(): Promise<{
  id: string;
  session: Session;
} | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const id = unsign(raw);
  if (!id) return null;
  const session = store().get(id);
  return session ? { id, session } : null;
}

/* Mark the cookie `secure` in production so it only travels over HTTPS.
   A `secure` cookie is silently dropped over plain HTTP, which would make
   login impossible on a LAN/home-server deployment served without TLS —
   so allow an explicit opt-out. Only set COOKIE_SECURE=false on a network
   you trust; without TLS the session cookie is exposed in transit. */
function cookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "false" || override === "0") return false;
  if (override === "true" || override === "1") return true;
  return process.env.NODE_ENV === "production";
}

export async function setSessionCookie(id: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sign(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/* ------------------------------ route guards --------------------------- */
/** Require an authenticated session. Returns the session, or a 401 Response. */
export async function requireAuth(): Promise<Session | Response> {
  const cur = await currentSession();
  if (!cur) return Response.json({ error: "Not authenticated" }, { status: 401 });
  return cur.session;
}

/** Require an authenticated session with `m` unlocked; bumps activity.
    Returns the session, or a 401/403 Response. */
export async function requireOpenModule(
  m: ProtectedModule,
): Promise<Session | Response> {
  const cur = await currentSession();
  if (!cur) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!moduleOpen(cur.session, m)) {
    return Response.json({ error: `${m} is locked` }, { status: 403 });
  }
  touchModule(cur.session, m); // access = activity → reset idle timer
  return cur.session;
}
