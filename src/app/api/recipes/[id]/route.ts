import { macros } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { parseRecipeBody } from "@/lib/recipeInput";
import { badRequest, json, notFound, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/recipes/:id — replace a saved meal's name and ingredients
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/recipes/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;

    const { id } = await ctx.params;
    const parsed = parseRecipeBody(await readJson(request));
    if (!parsed.ok) return badRequest(parsed.error);

    const updated = macros.updateRecipe(id, parsed.name, parsed.items);
    return updated ? json(updated) : notFound("Meal not found");
  } catch (e) {
    return serverError(e);
  }
}

// DELETE /api/recipes/:id — forget a saved meal (logged entries are untouched)
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/recipes/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { id } = await ctx.params;
    return macros.removeRecipe(id)
      ? json({ ok: true })
      : notFound("Meal not found");
  } catch (e) {
    return serverError(e);
  }
}
