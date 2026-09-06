"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, ScanLine, Trash2, X } from "lucide-react";
import { Card } from "@/components/Card";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useFoodSearch, useMacros, useRecipes, useSession } from "@/lib/hooks";
import type {
  FoodItem,
  MacroSource,
  PortionUnit,
  RecipeItem,
} from "@/lib/types";

/* =====================================================================
   Macros — the fuller tracker behind the dashboard tile (brief step 8).
   Food comes from Open Food Facts by name search or barcode; macros are
   computed from the portion in grams. Manual entry stays available for
   anything not in the database.
   ===================================================================== */

const round1 = (n: number) => Math.round(n * 10) / 10;

function Bar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="h-1.5 w-full bg-gray-200">
      <div className="h-full bg-gray-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* Scale a food's per-100g macros to the entered portion. */
function portionMacros(food: FoodItem, grams: number) {
  const f = grams / 100;
  return {
    kcal: Math.round(food.per100g.kcal * f),
    protein: round1(food.per100g.protein * f),
    carbs: round1(food.per100g.carbs * f),
    fat: round1(food.per100g.fat * f),
  };
}

/* Which units make sense for this product. Open Food Facts publishes one
   "per 100 g / 100 ml" figure, so for drinks ml and g are interchangeable
   (density ≈ 1). Solids deliberately do NOT offer ml: converting volume to
   mass needs a density we don't have — chocolate is ~1.3, flour ~0.5 — so
   the answer would be quietly wrong. */
function unitsFor(food: FoodItem): PortionUnit[] {
  const base: PortionUnit[] = food.isLiquid ? ["ml", "g"] : ["g"];
  return food.servingGrams ? [...base, "serving"] : base;
}

/** Convert an amount in the chosen unit to the gram-equivalent for the maths. */
function toGrams(amount: number, unit: PortionUnit, food: FoodItem): number {
  if (unit === "serving") return amount * (food.servingGrams ?? 0);
  return amount; // g, and ml at density ≈ 1
}

/** Human label stored with the entry, e.g. "330 ml" or "1 × serving (50 g)". */
function portionLabel(
  amount: number,
  unit: PortionUnit,
  food: FoodItem,
): string {
  if (unit === "serving") {
    const each = food.servingGrams ?? 0;
    const suffix = food.isLiquid ? "ml" : "g";
    return `${round1(amount)} × serving (${round1(each)} ${suffix})`;
  }
  return `${round1(amount)} ${unit}`;
}

/** A search hit, expanded so a portion can be chosen before logging. */
function FoodResult({
  food,
  source,
  onLog,
  onAddToMeal,
}: {
  food: FoodItem;
  source: MacroSource;
  onAddToMeal: (item: RecipeItem) => void;
  onLog: (m: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    label: string;
    grams: number;
    portion: string;
    source: MacroSource;
  }) => void;
}) {
  const units = unitsFor(food);
  const [unit, setUnit] = useState<PortionUnit>(units[0]);
  // Default to a sensible amount for the chosen unit: one serving, or 100 g/ml.
  const [amount, setAmount] = useState(unit === "serving" ? "1" : "100");

  const value = Number(amount) || 0;
  const grams = toGrams(value, unit, food);
  const m = portionMacros(food, grams);
  const label = [food.brand, food.name].filter(Boolean).join(" · ");

  const pickUnit = (u: PortionUnit) => {
    setUnit(u);
    setAmount(u === "serving" ? "1" : "100");
  };

  const log = () =>
    value > 0 &&
    onLog({
      ...m,
      label,
      grams,
      portion: portionLabel(value, unit, food),
      source,
    });

  return (
    <li className="border border-gray-200">
      <div className="px-3 py-2">
        <div className="text-sm text-gray-900">{food.name}</div>
        <div className="mt-0.5 font-mono text-[10px] text-gray-400">
          {food.brand && <span>{food.brand} · </span>}
          {food.per100g.kcal} kcal/100g · P {round1(food.per100g.protein)} · C{" "}
          {round1(food.per100g.carbs)} · F {round1(food.per100g.fat)}
          {food.quantity && <span> · pack {food.quantity}</span>}
        </div>

        <div className="mt-2 flex items-end gap-2">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
              Amount
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && log()}
              className="mt-1 w-20 border border-gray-300 bg-transparent px-2 py-1 font-mono text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {/* Unit picker — only the units that make sense for this product. */}
          <div className="flex shrink-0">
            {units.map((u) => (
              <button
                key={u}
                onClick={() => pickUnit(u)}
                className={`border px-2 py-1 font-mono text-[11px] ${
                  u === unit
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-600 hover:border-gray-900"
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 gap-1">
            <button
              onClick={() =>
                value > 0 &&
                onAddToMeal({
                  ...m,
                  label,
                  grams,
                  portion: portionLabel(value, unit, food),
                })
              }
              disabled={value <= 0}
              title="Add as an ingredient to a saved meal"
              className="border border-gray-300 px-2 py-1 font-mono text-xs text-gray-600 hover:border-gray-900 disabled:opacity-40"
            >
              + Meal
            </button>
            <button
              onClick={log}
              disabled={value <= 0}
              className="border border-gray-900 px-2 py-1 font-mono text-xs text-gray-900 hover:bg-gray-900 hover:text-white disabled:opacity-40"
            >
              Log
            </button>
          </div>
        </div>
        <div className="mt-2 font-mono text-xs text-gray-600">
          = {m.kcal} kcal · P {m.protein} · C {m.carbs} · F {m.fat}
          {unit === "serving" && food.servingSize && (
            <span className="text-gray-400"> · serving: {food.servingSize}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/* One ingredient inside the meal builder. The amount can be adjusted in
   place: macros scale linearly with mass, so the stored gram-equivalent
   gives an exact rescale without needing to re-query the food database. */
function IngredientLine({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: RecipeItem;
  index: number;
  onChange: (index: number, next: RecipeItem) => void;
  onRemove: (index: number) => void;
}) {
  const base = item.grams ?? 0;
  const editable = base > 0;
  // "350 ml" stays ml; anything else is treated as grams.
  const unit = item.portion && /\bml\b/i.test(item.portion) ? "ml" : "g";

  const rescale = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0 || !editable) return;
    const f = next / base;
    onChange(index, {
      ...item,
      grams: next,
      portion: `${round1(next)} ${unit}`,
      kcal: Math.round(item.kcal * f),
      protein: round1(item.protein * f),
      carbs: round1(item.carbs * f),
      fat: round1(item.fat * f),
    });
  };

  return (
    <li className="flex items-center gap-2 border-b border-gray-100 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-800">{item.label}</div>
        <div className="font-mono text-[10px] text-gray-400">
          {Math.round(item.kcal)} kcal · P {round1(item.protein)} · C{" "}
          {round1(item.carbs)} · F {round1(item.fat)}
        </div>
      </div>

      {editable ? (
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min="0"
            step="any"
            value={base}
            onChange={(e) => rescale(e.target.value)}
            className="w-16 border border-gray-300 bg-transparent px-1 py-0.5 text-right font-mono text-xs focus:border-gray-900 focus:outline-none"
          />
          <span className="font-mono text-[10px] text-gray-400">{unit}</span>
        </div>
      ) : (
        <span className="shrink-0 font-mono text-[10px] text-gray-400">
          {item.portion ?? "—"}
        </span>
      )}

      <button
        onClick={() => onRemove(index)}
        className="shrink-0 text-gray-400 hover:text-gray-900"
        aria-label="Remove ingredient"
      >
        <X size={14} />
      </button>
    </li>
  );
}

export default function MacroTracker() {
  const session = useSession();
  const { summary, past, loading, error, add, remove, logAgain } = useMacros();
  const food = useFoodSearch();
  const meals = useRecipes();
  const [mealName, setMealName] = useState("");

  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastSource, setLastSource] = useState<MacroSource>("search");
  const [manual, setManual] = useState({
    label: "",
    kcal: "",
    p: "",
    c: "",
    f: "",
  });

  if (session.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="font-mono text-[11px] uppercase tracking-widest text-gray-400">
          Loading…
        </div>
      </div>
    );
  }
  if (!session.authed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <p className="text-sm text-gray-600">Please sign in to the hub first.</p>
        <Link
          href="/"
          className="border border-gray-900 px-3 py-1.5 font-mono text-xs text-gray-900 hover:bg-gray-900 hover:text-white"
        >
          Go to the hub
        </Link>
      </div>
    );
  }

  const totals = summary?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const targets = summary?.targets ?? {
    kcal: 2200,
    protein: 160,
    carbs: 220,
    fat: 70,
  };
  const entries = summary?.entries ?? [];

  const runSearch = () => {
    if (q.trim().length < 2) return;
    setLastSource("search");
    food.search(q.trim());
  };
  /* Note: this gets a new identity on every render, and this component
     re-renders every second (the session countdown). <BarcodeScanner/>
     therefore holds it in a ref rather than depending on it — otherwise the
     camera restarts continuously. */
  const runBarcode = (code: string) => {
    setBarcode(code);
    setScanning(false);
    setLastSource("barcode");
    food.byBarcode(code);
  };

  const logManual = async () => {
    const m = {
      kcal: Number(manual.kcal) || 0,
      protein: Number(manual.p) || 0,
      carbs: Number(manual.c) || 0,
      fat: Number(manual.f) || 0,
      label: manual.label.trim(),
      source: "manual" as const,
    };
    if (m.kcal <= 0 && m.protein <= 0 && m.carbs <= 0 && m.fat <= 0) return;
    if (await add(m)) setManual({ label: "", kcal: "", p: "", c: "", f: "" });
  };

  const rows: [string, number, number][] = [
    ["Protein", totals.protein, targets.protein],
    ["Carbs", totals.carbs, targets.carbs],
    ["Fat", totals.fat, targets.fat],
  ];

  return (
    <div className="min-h-screen bg-canvas text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-8 flex items-end justify-between border-b border-gray-900 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-gray-400">
              Macros
            </div>
            <h1 className="font-mono text-3xl font-bold tracking-tight">
              TRACKER
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
          >
            <ArrowLeft size={12} /> Hub
          </Link>
        </header>

        <div className="space-y-4">
          {/* ---- Today's totals ---- */}
          <Card label="Today" right={summary?.day}>
            {loading ? (
              <div className="py-2 font-mono text-[11px] text-gray-400">
                Loading…
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-4xl font-bold tracking-tight">
                      {Math.round(totals.kcal)}
                    </span>
                    <span className="ml-1 font-mono text-sm text-gray-400">
                      / {targets.kcal} kcal
                    </span>
                  </div>
                  <span className="font-mono text-xs text-gray-500">
                    {Math.max(0, Math.round(targets.kcal - totals.kcal))} left
                  </span>
                </div>
                <div className="mt-2">
                  <Bar value={totals.kcal} target={targets.kcal} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-4">
                  {rows.map(([name, val, tgt]) => (
                    <div key={name}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-600">{name}</span>
                        <span className="font-mono text-xs text-gray-500">
                          {round1(val)}/{tgt}g
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Bar value={val} target={tgt} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {error && (
              <div className="mt-2 inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
                {error}
              </div>
            )}
          </Card>

          {/* ---- Add food ---- */}
          <Card label="Add food">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 border border-gray-300 px-2">
                <Search size={14} className="shrink-0 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Search food by name…"
                  className="w-full bg-transparent py-1.5 text-sm focus:outline-none"
                />
              </div>
              <button
                onClick={runSearch}
                disabled={food.searching || q.trim().length < 2}
                className="shrink-0 border border-gray-900 px-3 font-mono text-xs text-gray-900 hover:bg-gray-900 hover:text-white disabled:opacity-40"
              >
                {food.searching ? "…" : "Search"}
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && barcode.trim() && runBarcode(barcode.trim())
                }
                placeholder="or type a barcode…"
                inputMode="numeric"
                className="w-full border border-gray-300 bg-transparent px-2 py-1.5 font-mono text-sm focus:border-gray-900 focus:outline-none"
              />
              <button
                onClick={() => barcode.trim() && runBarcode(barcode.trim())}
                disabled={!barcode.trim()}
                className="shrink-0 border border-gray-300 px-3 font-mono text-xs text-gray-600 hover:border-gray-900 disabled:opacity-40"
              >
                Look up
              </button>
              <button
                onClick={() => setScanning((s) => !s)}
                className="inline-flex shrink-0 items-center gap-1 border border-gray-300 px-3 font-mono text-xs text-gray-600 hover:border-gray-900"
              >
                <ScanLine size={13} /> Scan
              </button>
            </div>

            {scanning && (
              <BarcodeScanner
                onDetect={runBarcode}
                onClose={() => setScanning(false)}
              />
            )}

            {food.error && (
              <div className="mt-3 inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
                {food.error}
              </div>
            )}

            {food.results.length > 0 && (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                    {food.results.length} result
                    {food.results.length === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={food.clear}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-900"
                  >
                    <X size={11} /> Clear
                  </button>
                </div>
                <ul className="mt-2 space-y-2">
                  {food.results.map((f) => (
                    <FoodResult
                      key={f.code}
                      food={f}
                      source={lastSource}
                      onLog={async (m) => {
                        if (await add(m)) food.clear();
                      }}
                      onAddToMeal={meals.addIngredient}
                    />
                  ))}
                </ul>
              </>
            )}
          </Card>

          {/* ---- Meal builder: only present while assembling one ---- */}
          {meals.building.length > 0 && (
            <Card
              label={meals.editingId ? "Editing meal" : "New meal"}
              right={`${Math.round(meals.builderTotals.kcal)} kcal`}
            >
              <ul className="mb-3">
                {meals.building.map((it, i) => (
                  <IngredientLine
                    key={`${it.label}-${i}`}
                    item={it}
                    index={i}
                    onChange={meals.replaceIngredient}
                    onRemove={meals.removeIngredient}
                  />
                ))}
              </ul>
              <p className="mb-3 text-[11px] text-gray-400">
                Adjust an amount to rescale its macros, or search above and use
                <span className="font-mono"> + Meal</span> to add more.
              </p>

              <div className="border-t border-gray-200 pt-3 font-mono text-xs text-gray-600">
                Total: {Math.round(meals.builderTotals.kcal)} kcal · P{" "}
                {round1(meals.builderTotals.protein)} · C{" "}
                {round1(meals.builderTotals.carbs)} · F{" "}
                {round1(meals.builderTotals.fat)}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && mealName.trim()) {
                      if (await meals.save(mealName.trim())) setMealName("");
                    }
                  }}
                  placeholder="Name it, e.g. Protein shake"
                  className="w-full border border-gray-300 bg-transparent px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                />
                <button
                  onClick={async () => {
                    if (mealName.trim() && (await meals.save(mealName.trim())))
                      setMealName("");
                  }}
                  disabled={!mealName.trim()}
                  className="shrink-0 bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700 disabled:opacity-40"
                >
                  {meals.editingId ? "Update meal" : "Save meal"}
                </button>
                <button
                  onClick={() => {
                    meals.clearBuilder();
                    setMealName("");
                  }}
                  className="shrink-0 border border-gray-300 px-3 font-mono text-xs text-gray-600 hover:border-gray-900"
                >
                  {meals.editingId ? "Cancel" : "Discard"}
                </button>
              </div>
              {meals.error && (
                <div className="mt-2 inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
                  {meals.error}
                </div>
              )}
            </Card>
          )}

          {/* ---- Saved meals ---- */}
          {meals.recipes.length > 0 && (
            <Card label="Saved meals" right={`${meals.recipes.length}`}>
              <ul>
                {meals.recipes.map((r) => (
                  <li
                    key={r.id}
                    className="group border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-gray-800">
                          {r.name}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">
                          {Math.round(r.totals.kcal)} kcal · P{" "}
                          {round1(r.totals.protein)} · C{" "}
                          {round1(r.totals.carbs)} · F {round1(r.totals.fat)} ·{" "}
                          {r.items.length} ingredient
                          {r.items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          add({
                            kcal: r.totals.kcal,
                            protein: r.totals.protein,
                            carbs: r.totals.carbs,
                            fat: r.totals.fat,
                            label: r.name,
                            portion: `${r.items.length} ingredients`,
                            source: "manual",
                          })
                        }
                        className="inline-flex shrink-0 items-center gap-1 border border-gray-900 px-2 py-1 font-mono text-[11px] text-gray-900 hover:bg-gray-900 hover:text-white"
                      >
                        <Plus size={12} /> Add
                      </button>
                      <button
                        onClick={() => {
                          meals.startEdit(r);
                          setMealName(r.name);
                        }}
                        className="shrink-0 border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => meals.remove(r.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                        aria-label="Delete meal"
                      >
                        <Trash2
                          size={13}
                          className="text-gray-400 hover:text-gray-900"
                        />
                      </button>
                    </div>
                    <div className="mt-0.5 truncate pl-0 font-mono text-[10px] text-gray-500">
                      {r.items.map((i) => i.label).join(" + ")}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---- Past entries: one tap to log a staple again ---- */}
          <Card label="Past entries" right={past.length ? `${past.length}` : undefined}>
            {past.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">
                Nothing logged yet. Foods you log will appear here so you can
                add them again with one tap.
              </p>
            ) : (
              <ul>
                {past.map((p) => (
                  <li
                    key={p.label}
                    className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-gray-800">
                        {p.label}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400">
                        {p.portion ? `${p.portion} · ` : ""}
                        {Math.round(p.kcal)} kcal · P {round1(p.protein)} · C{" "}
                        {round1(p.carbs)} · F {round1(p.fat)}
                        {p.uses > 1 && <span> · ×{p.uses}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => logAgain(p)}
                      className="inline-flex shrink-0 items-center gap-1 border border-gray-900 px-2 py-1 font-mono text-[11px] text-gray-900 hover:bg-gray-900 hover:text-white"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Manual entry ---- */}
          <Card label="Manual entry">
            <input
              value={manual.label}
              onChange={(e) =>
                setManual((d) => ({ ...d, label: e.target.value }))
              }
              placeholder="What was it? (optional)"
              className="w-full border border-gray-300 bg-transparent px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(["kcal", "p", "c", "f"] as const).map((k) => (
                <div key={k}>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                    {k}
                  </label>
                  <input
                    type="number"
                    value={manual[k]}
                    onChange={(e) =>
                      setManual((d) => ({ ...d, [k]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && logManual()}
                    placeholder="0"
                    className="mt-1 w-full border border-gray-300 bg-transparent px-2 py-1 font-mono text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={logManual}
              className="mt-3 inline-flex items-center gap-1 bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700"
            >
              <Plus size={13} /> Add to today
            </button>
          </Card>

          {/* ---- Logged today ---- */}
          <Card label="Logged today" right={`${entries.length}`}>
            {entries.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">Nothing logged yet.</p>
            ) : (
              <ul>
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-gray-800">
                        {e.label || "Manual entry"}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400">
                        {e.portion
                          ? `${e.portion} · `
                          : e.grams
                            ? `${round1(e.grams)} g · `
                            : ""}
                        P {round1(e.protein)} · C {round1(e.carbs)} · F{" "}
                        {round1(e.fat)}
                        {e.source && e.source !== "manual" && (
                          <span> · {e.source}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-gray-700">
                      {Math.round(e.kcal)} kcal
                    </span>
                    <button
                      onClick={() => remove(e.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100"
                      aria-label="Remove entry"
                    >
                      <Trash2
                        size={13}
                        className="text-gray-400 hover:text-gray-900"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
