import { requireAuth } from "@/lib/session";
import {
  FoodDbUnavailableError,
  isValidBarcode,
  lookupBarcode,
  searchFoods,
} from "@/lib/foods";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/foods?q=oat+milk      → search by name
   GET /api/foods?barcode=123456  → exact product lookup
   Proxied server-side so the browser never contacts Open Food Facts. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;

    const params = new URL(request.url).searchParams;
    const barcode = params.get("barcode");
    const q = params.get("q");

    if (barcode) {
      if (!isValidBarcode(barcode)) return badRequest("invalid barcode");
      const food = await lookupBarcode(barcode);
      return food ? json([food]) : json([]);
    }

    if (!q || q.trim().length < 2) {
      return badRequest("query must be at least 2 characters");
    }
    return json(await searchFoods(q.trim()));
  } catch (e) {
    if (e instanceof FoodDbUnavailableError) {
      console.warn("[api] foods: Open Food Facts unavailable");
      return json(
        { error: "Open Food Facts is busy right now — try again in a moment." },
        503,
      );
    }
    console.error("[api] foods:", e);
    return serverError(e);
  }
}
