/* ---------------------------------------------------------------------
   Shared data-layer types. Imported by both the API routes (server) and,
   from step 3 on, the module components (client).
   --------------------------------------------------------------------- */

export type ListName = "personal" | "work" | "shopping";
export const LIST_NAMES: ListName[] = ["personal", "work", "shopping"];

export interface ListItem {
  id: string;
  list: ListName;
  text: string;
  done: boolean;
  created_at: number;
}

export type BudgetType = "income" | "expense";

export interface BudgetLine {
  id: string;
  label: string;
  amount: number;
  type: BudgetType;
  created_at: number;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  created_at: number;
}

export type MacroSource = "manual" | "search" | "barcode";

export interface MacroEntry {
  id: string;
  day: string; // YYYY-MM-DD (local day the entry was logged)
  label: string; // what was eaten ("" for legacy rows)
  grams: number | null; // normalised gram-equivalent of the portion
  portion: string | null; // as entered, e.g. "330 ml", "1 × serving", "80 g"
  source: MacroSource | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: number;
}

/* A food from Open Food Facts, normalised to per-100g macros.
   For drinks the same figures are per 100 ml — Open Food Facts publishes a
   single "per 100 g / 100 ml" set, and at a density of ~1 the two coincide
   closely enough for tracking. */
export interface FoodItem {
  code: string; // barcode
  name: string;
  brand: string | null;
  quantity: string | null; // pack size as printed, e.g. "500 g"
  servingSize: string | null; // as printed, e.g. "330ml"
  servingGrams: number | null; // numeric size of one serving, when declared
  isLiquid: boolean; // measured in ml rather than g
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
}

/** How a portion was entered. */
export type PortionUnit = "g" | "ml" | "serving";

/* A saved meal: several ingredients combined under one name, e.g.
   "Protein shake" = 60 g whey + 350 ml milk. Logging one writes a single
   macro entry carrying the combined totals. */
export interface RecipeItem {
  label: string;
  portion: string | null;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  id: string;
  name: string;
  created_at: number;
  items: RecipeItem[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

/* A previously-logged food, offered for one-tap re-logging. Deduplicated by
   name and ordered most-recent-first, carrying the portion and macros from
   the last time it was logged. */
export interface PastEntry {
  label: string;
  uses: number; // how many times it's been logged
  lastUsed: number; // epoch ms
  grams: number | null;
  portion: string | null;
  source: MacroSource | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroSummary {
  day: string;
  totals: MacroTargets; // same shape (kcal/protein/carbs/fat), summed
  targets: MacroTargets;
  entries: MacroEntry[];
}

/* ------------------------------- auth ------------------------------- */
export type ProtectedModule = "budget" | "health";
export const PROTECTED_MODULES: ProtectedModule[] = ["budget", "health"];

export interface ModuleLockState {
  open: boolean;
  secsLeft: number; // seconds until idle auto-relock (server truth at fetch time)
}

export interface SessionState {
  authed: boolean;
  modules: Record<ProtectedModule, ModuleLockState>;
}

/* --------------------------- health docs ---------------------------- */
export interface HealthDoc {
  id: string; // opaque handle used in URLs (never a raw path)
  name: string; // filename without extension — the human label
  ext: string; // lowercase, no dot ("pdf")
  size: number; // bytes
  modified: number; // epoch ms
}

export interface HealthDocsResult {
  configured: boolean; // HEALTH_DOCS_DIR set and the folder exists
  mailConfigured: boolean; // SMTP credentials present
  docs: HealthDoc[];
}

/** What a prepared (not yet sent) email would deliver — shown for confirmation. */
export interface PendingEmail {
  token: string;
  filename: string;
  size: number;
  to: string;
  from: string;
}

/* ----------------------------- calendar ----------------------------- */
export interface CalendarAccount {
  id: string;
  email: string; // "" until backfilled from the Calendar API
}

export interface CalendarStatus {
  configured: boolean; // Google OAuth client id/secret present in env
  connected: boolean; // at least one account connected
  accounts: CalendarAccount[];
}

export interface CalendarEvent {
  id: string;
  time: string; // "09:00" or "All day"
  name: string;
  url: string; // htmlLink — deep-links to the event in Google Calendar
  allDay: boolean;
  accountEmail: string; // which connected account it came from
  startsAt: number; // epoch ms, used to merge accounts in time order
}

/* ------------------------------ weather ----------------------------- */
// The brief's warning categories: snow, hail, rain, temp extremes.
export type WeatherWarningKind = "rain" | "snow" | "hail" | "cold" | "heat";

export interface WeatherWarning {
  kind: WeatherWarningKind;
  text: string;
}

export interface Weather {
  location: string;
  temp: number;
  feelsLike: number;
  description: string;
  wind: number; // km/h
  high: number;
  low: number;
  warnings: WeatherWarning[];
  updatedAt: number; // epoch ms the hub fetched it
}
