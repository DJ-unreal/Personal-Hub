import { macros } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local calendar day as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Accept both full names and the prototype's p/c/f short keys.
function num(...vals: unknown[]): number {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

// GET /api/macros?day=YYYY-MM-DD   (day optional → today)
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const dayParam = new URL(request.url).searchParams.get("day");
    if (dayParam !== null && !isDay(dayParam))
      return badRequest("day must be YYYY-MM-DD");
    return json(macros.summary(dayParam ?? today()));
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/macros   { kcal, protein|p, carbs|c, fat|f, day? }
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("Invalid JSON body");

    const day =
      typeof body.day === "string" && isDay(body.day) ? body.day : today();

    const entry = {
      kcal: num(body.kcal),
      protein: num(body.protein, body.p),
      carbs: num(body.carbs, body.c),
      fat: num(body.fat, body.f),
      label: typeof body.label === "string" ? body.label.slice(0, 200) : "",
      grams:
        body.grams !== undefined && Number.isFinite(Number(body.grams))
          ? Number(body.grams)
          : null,
      portion:
        typeof body.portion === "string" ? body.portion.slice(0, 60) : null,
      source:
        body.source === "search" || body.source === "barcode"
          ? (body.source as "search" | "barcode")
          : ("manual" as const),
    };
    if (entry.kcal <= 0 && entry.protein <= 0 && entry.carbs <= 0 && entry.fat <= 0)
      return badRequest("provide at least one positive macro value");

    macros.addEntry(day, entry);
    return json(macros.summary(day), 201);
  } catch (e) {
    return serverError(e);
  }
}
