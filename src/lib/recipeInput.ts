import type { RecipeItem } from "@/lib/types";
import { nonEmptyString } from "@/lib/http";

/* Shared request validation for saving a meal. Used by both create (POST)
   and update (PUT) so the two can't drift apart. Returns either the parsed
   ingredients or a message describing what's wrong. */

export type ParsedRecipe =
  | { ok: true; name: string; items: RecipeItem[] }
  | { ok: false; error: string };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function parseRecipeBody(body: unknown): ParsedRecipe {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const { name: rawName, items: rawItems } = body as {
    name?: unknown;
    items?: unknown;
  };

  const name = nonEmptyString(rawName);
  if (!name) return { ok: false, error: "name is required" };
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: "at least one ingredient is required" };
  }

  const items: RecipeItem[] = [];
  for (const raw of rawItems as Record<string, unknown>[]) {
    const label = nonEmptyString(raw?.label);
    if (!label) return { ok: false, error: "every ingredient needs a label" };
    items.push({
      label: label.slice(0, 200),
      portion: typeof raw.portion === "string" ? raw.portion.slice(0, 60) : null,
      grams: Number.isFinite(Number(raw.grams)) ? Number(raw.grams) : null,
      kcal: num(raw.kcal),
      protein: num(raw.protein),
      carbs: num(raw.carbs),
      fat: num(raw.fat),
    });
  }

  return { ok: true, name: name.slice(0, 120), items };
}
