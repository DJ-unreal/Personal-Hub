import { macros } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { parseRecipeBody } from "@/lib/recipeInput";
import { badRequest, json, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/recipes → saved meals with their ingredients and totals
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    return json(macros.recipes());
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/recipes   { name, items: [{ label, portion?, grams?, kcal, ... }] }
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;

    const parsed = parseRecipeBody(await readJson(request));
    if (!parsed.ok) return badRequest(parsed.error);

    return json(macros.createRecipe(parsed.name, parsed.items), 201);
  } catch (e) {
    return serverError(e);
  }
}
