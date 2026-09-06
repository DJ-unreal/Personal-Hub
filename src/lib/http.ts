/* Small helpers for consistent JSON responses from route handlers. */

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(e: unknown) {
  console.error("[api] unhandled error:", e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

/** Parse a JSON request body, returning null on malformed/empty input. */
export async function readJson<T = unknown>(
  request: Request,
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Trim a value and return it only if it's a non-empty string. */
export function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
