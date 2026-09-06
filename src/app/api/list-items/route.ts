import { listItems } from "@/lib/repos";
import { LIST_NAMES, type ListName } from "@/lib/types";
import { requireAuth } from "@/lib/session";
import { badRequest, json, readJson, nonEmptyString, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isListName(v: unknown): v is ListName {
  return typeof v === "string" && (LIST_NAMES as string[]).includes(v);
}

// GET /api/list-items?list=personal   (list optional → all lists)
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const listParam = new URL(request.url).searchParams.get("list");
    if (listParam !== null && !isListName(listParam)) {
      return badRequest(`list must be one of ${LIST_NAMES.join(", ")}`);
    }
    return json(listItems.all(listParam ?? undefined));
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/list-items   { list, text }
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const body = await readJson<{ list?: unknown; text?: unknown }>(request);
    if (!body) return badRequest("Invalid JSON body");
    if (!isListName(body.list)) {
      return badRequest(`list must be one of ${LIST_NAMES.join(", ")}`);
    }
    const text = nonEmptyString(body.text);
    if (!text) return badRequest("text is required");
    return json(listItems.create(body.list, text), 201);
  } catch (e) {
    return serverError(e);
  }
}
