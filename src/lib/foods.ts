import type { FoodItem } from "@/lib/types";

/* =====================================================================
   Open Food Facts — keyless food database (brief step 8). Queried
   server-side so the browser never talks to a third party directly.

   Two search backends, because OFF's endpoints differ in reliability:
     1. search.openfoodfacts.org ("search-a-licious") — modern, stable.
        Returns `hits`, `brands` as an array, energy usually only in kJ.
     2. world.openfoodfacts.org/cgi/search.pl — legacy fallback. Returns
        `products`, `brands` as a comma-separated string, and is prone to
        503s and (worse) HTML error pages served with a 200.
   Barcode lookup uses the v2 product endpoint, which is dependable.
   ===================================================================== */

const UA = "PersonalHub/1.0 (self-hosted personal dashboard)";
const FIELDS =
  "code,product_name,brands,quantity,serving_size,serving_quantity," +
  "product_quantity_unit,categories_tags,nutriments";

/** Thrown when every backend fails, so the route can answer 503 not 500. */
export class FoodDbUnavailableError extends Error {}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  brands?: string | string[];
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  product_quantity_unit?: string;
  categories_tags?: string[];
  nutriments?: Record<string, unknown>;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** kcal per 100 g. search-a-licious often supplies only kJ. */
function kcalPer100g(n: Record<string, unknown>): number {
  const kcal = num(n["energy-kcal_100g"]);
  if (kcal > 0) return kcal;
  const kj = num(n["energy-kj_100g"]) || num(n["energy_100g"]);
  return kj > 0 ? Math.round(kj / 4.184) : 0;
}

/** `brands` is an array in one API and a comma-separated string in the other. */
function firstBrand(b: string | string[] | undefined): string | null {
  if (Array.isArray(b)) return b[0]?.trim() || null;
  return b?.split(",")[0]?.trim() || null;
}

/* Is this measured in millilitres? `product_quantity_unit` is authoritative
   when present; otherwise fall back to the beverage categories, then to the
   printed pack size ("330ml"). */
function detectLiquid(p: OffProduct): boolean {
  const unit = p.product_quantity_unit?.trim().toLowerCase();
  if (unit === "ml" || unit === "l" || unit === "cl") return true;
  if (unit === "g" || unit === "kg") return false;
  if ((p.categories_tags ?? []).some((c) => /beverage|drink|water|juice|soda/.test(c)))
    return true;
  return /\d\s*(ml|cl|l)\b/i.test(`${p.quantity ?? ""} ${p.serving_size ?? ""}`);
}

function toFoodItem(p: OffProduct): FoodItem | null {
  const code = p.code?.trim();
  const name = (p.product_name_de || p.product_name || "").trim();
  if (!code || !name) return null;

  const n = p.nutriments ?? {};
  const per100g = {
    kcal: kcalPer100g(n),
    protein: num(n["proteins_100g"]),
    carbs: num(n["carbohydrates_100g"]),
    fat: num(n["fat_100g"]),
  };
  if (per100g.kcal <= 0) return null; // no energy → useless for tracking

  const serving = num(p.serving_quantity);

  return {
    code,
    name,
    brand: firstBrand(p.brands),
    quantity: p.quantity?.trim() || null,
    servingSize: p.serving_size?.trim() || null,
    servingGrams: serving > 0 ? serving : null,
    isLiquid: detectLiquid(p),
    per100g,
  };
}

/** Fetch JSON, treating a non-2xx *or* a non-JSON body as a failure —
    the legacy endpoint sometimes returns an HTML error page with a 200. */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 86400 }, // food data is effectively static
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("non-JSON response");
  }
}

async function searchViaSearchalicious(query: string): Promise<FoodItem[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: "20",
    fields: FIELDS,
  });
  const data = (await fetchJson(
    `https://search.openfoodfacts.org/search?${params}`,
  )) as { hits?: OffProduct[] };
  return (data.hits ?? [])
    .map(toFoodItem)
    .filter((f): f is FoodItem => f !== null);
}

async function searchViaLegacyCgi(query: string): Promise<FoodItem[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    fields: FIELDS,
  });
  const data = (await fetchJson(
    `https://world.openfoodfacts.org/cgi/search.pl?${params}`,
  )) as { products?: OffProduct[] };
  return (data.products ?? [])
    .map(toFoodItem)
    .filter((f): f is FoodItem => f !== null);
}

export async function searchFoods(query: string): Promise<FoodItem[]> {
  let firstError: unknown;
  for (const backend of [searchViaSearchalicious, searchViaLegacyCgi]) {
    try {
      const results = await backend(query);
      if (results.length > 0) return results.slice(0, 15);
      firstError ??= null; // succeeded but empty — try the other backend
    } catch (e) {
      firstError ??= e;
      console.warn(`[foods] ${backend.name} failed:`, (e as Error).message);
    }
  }
  // Both threw → the database is unreachable. Both empty → genuinely no hits.
  if (firstError) throw new FoodDbUnavailableError("Food database unavailable");
  return [];
}

export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  try {
    const data = (await fetchJson(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
    )) as { status?: number; product?: OffProduct };
    if (data.status !== 1 || !data.product) return null;
    return toFoodItem(data.product);
  } catch (e) {
    throw new FoodDbUnavailableError((e as Error).message);
  }
}

/** Barcodes are digits only (EAN-8/13, UPC-A/E). */
export function isValidBarcode(code: string): boolean {
  return /^\d{6,14}$/.test(code);
}
