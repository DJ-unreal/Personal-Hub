import { getDb, newId } from "@/lib/db";
import { decryptJSON, encryptJSON } from "@/lib/crypto";
import type {
  BudgetLine,
  BudgetType,
  ListItem,
  ListName,
  MacroEntry,
  MacroSource,
  MacroSummary,
  MacroTargets,
  PastEntry,
  QuickLink,
  Recipe,
  RecipeItem,
} from "@/lib/types";

/* =====================================================================
   Repositories — typed CRUD over the SQLite tables. Route handlers call
   these; they never touch SQL directly. Row → domain mapping (e.g. the
   0/1 `done` integer → boolean) happens here.
   ===================================================================== */

/* ------------------------------- lists ------------------------------ */
type ListItemRow = Omit<ListItem, "done"> & { done: number };
const toListItem = (r: ListItemRow): ListItem => ({ ...r, done: r.done === 1 });

export const listItems = {
  all(list?: ListName): ListItem[] {
    const db = getDb();
    const rows = list
      ? db
          .prepare(
            "SELECT * FROM list_items WHERE list = ? ORDER BY created_at ASC, rowid ASC",
          )
          .all(list)
      : db
          .prepare(
            "SELECT * FROM list_items ORDER BY list ASC, created_at ASC, rowid ASC",
          )
          .all();
    return (rows as ListItemRow[]).map(toListItem);
  },

  create(list: ListName, text: string): ListItem {
    const item: ListItem = {
      id: newId(),
      list,
      text,
      done: false,
      created_at: Date.now(),
    };
    getDb()
      .prepare(
        "INSERT INTO list_items (id, list, text, done, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(item.id, item.list, item.text, item.done ? 1 : 0, item.created_at);
    return item;
  },

  update(id: string, patch: { done?: boolean; text?: string }): ListItem | null {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM list_items WHERE id = ?")
      .get(id) as ListItemRow | undefined;
    if (!existing) return null;
    const done = patch.done ?? existing.done === 1;
    const text = patch.text ?? existing.text;
    db.prepare("UPDATE list_items SET done = ?, text = ? WHERE id = ?").run(
      done ? 1 : 0,
      text,
      id,
    );
    return toListItem({ ...existing, done: done ? 1 : 0, text });
  },

  remove(id: string): boolean {
    return (
      getDb().prepare("DELETE FROM list_items WHERE id = ?").run(id).changes > 0
    );
  },
};

/* ------------------------------ budget ------------------------------ */
/* Protected tier: sensitive fields (label/amount/type) are stored AES-256-GCM
   encrypted in the `enc` blob; only id + created_at are plaintext. */
type BudgetData = { label: string; amount: number; type: BudgetType };
type BudgetRow = { id: string; enc: string; created_at: number };

export const budget = {
  all(): BudgetLine[] {
    const rows = getDb()
      .prepare(
        "SELECT id, enc, created_at FROM budget_lines ORDER BY created_at ASC, rowid ASC",
      )
      .all() as unknown as BudgetRow[];
    return rows.map((r) => {
      const d = decryptJSON<BudgetData>(r.enc);
      return {
        id: r.id,
        label: d.label,
        amount: d.amount,
        type: d.type,
        created_at: r.created_at,
      };
    });
  },

  create(label: string, amount: number, type: BudgetType): BudgetLine {
    const line: BudgetLine = {
      id: newId(),
      label,
      amount,
      type,
      created_at: Date.now(),
    };
    getDb()
      .prepare(
        "INSERT INTO budget_lines (id, enc, created_at) VALUES (?, ?, ?)",
      )
      .run(line.id, encryptJSON({ label, amount, type }), line.created_at);
    return line;
  },

  remove(id: string): boolean {
    return (
      getDb().prepare("DELETE FROM budget_lines WHERE id = ?").run(id).changes >
      0
    );
  },
};

/* ------------------------------ links ------------------------------- */
export const links = {
  all(): QuickLink[] {
    return getDb()
      .prepare("SELECT * FROM quick_links ORDER BY created_at ASC, rowid ASC")
      .all() as unknown as QuickLink[];
  },

  create(label: string, url: string): QuickLink {
    const link: QuickLink = {
      id: newId(),
      label,
      url,
      created_at: Date.now(),
    };
    getDb()
      .prepare(
        "INSERT INTO quick_links (id, label, url, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(link.id, link.label, link.url, link.created_at);
    return link;
  },

  remove(id: string): boolean {
    return (
      getDb().prepare("DELETE FROM quick_links WHERE id = ?").run(id).changes > 0
    );
  },
};

/* ------------------------------ macros ------------------------------ */
export const macros = {
  targets(): MacroTargets {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = 'macro_targets'")
      .get() as { value: string } | undefined;
    return row
      ? (JSON.parse(row.value) as MacroTargets)
      : { kcal: 2200, protein: 160, carbs: 220, fat: 70 };
  },

  summary(day: string): MacroSummary {
    const db = getDb();
    const entries = db
      .prepare(
        "SELECT * FROM macro_entries WHERE day = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(day) as unknown as MacroEntry[];
    const totals = entries.reduce(
      (t, e) => ({
        kcal: t.kcal + e.kcal,
        protein: t.protein + e.protein,
        carbs: t.carbs + e.carbs,
        fat: t.fat + e.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    return { day, totals, targets: this.targets(), entries };
  },

  addEntry(
    day: string,
    m: {
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      label?: string;
      grams?: number | null;
      portion?: string | null;
      source?: MacroSource | null;
    },
  ): MacroEntry {
    const entry: MacroEntry = {
      id: newId(),
      day,
      label: m.label?.trim() || "",
      grams: m.grams ?? null,
      portion: m.portion?.trim() || null,
      source: m.source ?? null,
      kcal: m.kcal,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      created_at: Date.now(),
    };
    getDb()
      .prepare(
        "INSERT INTO macro_entries (id, day, label, grams, portion, source, kcal, protein, carbs, fat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.id,
        entry.day,
        entry.label,
        entry.grams,
        entry.portion,
        entry.source,
        entry.kcal,
        entry.protein,
        entry.carbs,
        entry.fat,
        entry.created_at,
      );
    return entry;
  },

  removeEntry(id: string): boolean {
    return (
      getDb().prepare("DELETE FROM macro_entries WHERE id = ?").run(id).changes >
      0
    );
  },

  /* ---------------------------- saved meals -------------------------- */
  /* A recipe is a named set of ingredient lines. Totals are summed on read
     rather than stored, so they can never drift from the ingredients. */
  recipes(): Recipe[] {
    const db = getDb();
    const heads = db
      .prepare("SELECT id, name, created_at FROM recipes ORDER BY name ASC")
      .all() as unknown as { id: string; name: string; created_at: number }[];
    if (heads.length === 0) return [];

    const itemsStmt = db.prepare(
      `SELECT label, portion, grams, kcal, protein, carbs, fat
         FROM recipe_items WHERE recipe_id = ? ORDER BY position ASC`,
    );
    return heads.map((h) => {
      const items = itemsStmt.all(h.id) as unknown as RecipeItem[];
      const totals = items.reduce(
        (t, i) => ({
          kcal: t.kcal + i.kcal,
          protein: t.protein + i.protein,
          carbs: t.carbs + i.carbs,
          fat: t.fat + i.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );
      return { ...h, items, totals };
    });
  },

  createRecipe(name: string, items: RecipeItem[]): Recipe {
    const db = getDb();
    const id = newId();
    const created_at = Date.now();
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO recipes (id, name, created_at) VALUES (?, ?, ?)",
      ).run(id, name, created_at);
      const ins = db.prepare(
        `INSERT INTO recipe_items
           (id, recipe_id, position, label, portion, grams, kcal, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      items.forEach((it, i) =>
        ins.run(
          newId(),
          id,
          i,
          it.label,
          it.portion ?? null,
          it.grams ?? null,
          it.kcal,
          it.protein,
          it.carbs,
          it.fat,
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return this.recipes().find((r) => r.id === id)!;
  },

  /* Replace a saved meal's name and ingredients wholesale. Simpler and
     safer than diffing lines, and the ingredient list is always small. */
  updateRecipe(id: string, name: string, items: RecipeItem[]): Recipe | null {
    const db = getDb();
    const exists = db
      .prepare("SELECT 1 FROM recipes WHERE id = ?")
      .get(id) as unknown;
    if (!exists) return null;

    db.exec("BEGIN");
    try {
      db.prepare("UPDATE recipes SET name = ? WHERE id = ?").run(name, id);
      db.prepare("DELETE FROM recipe_items WHERE recipe_id = ?").run(id);
      const ins = db.prepare(
        `INSERT INTO recipe_items
           (id, recipe_id, position, label, portion, grams, kcal, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      items.forEach((it, i) =>
        ins.run(
          newId(),
          id,
          i,
          it.label,
          it.portion ?? null,
          it.grams ?? null,
          it.kcal,
          it.protein,
          it.carbs,
          it.fat,
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return this.recipes().find((r) => r.id === id) ?? null;
  },

  removeRecipe(id: string): boolean {
    const db = getDb();
    // ON DELETE CASCADE covers the items, but be explicit in case the
    // foreign-key pragma is ever off.
    db.prepare("DELETE FROM recipe_items WHERE recipe_id = ?").run(id);
    return db.prepare("DELETE FROM recipes WHERE id = ?").run(id).changes > 0;
  },

  /* Previously-logged foods for one-tap re-logging. One row per distinct
     name, carrying the values from the most recent time it was logged, so
     "same protein shake as always" is a single tap. Newest first. */
  pastEntries(limit = 12): PastEntry[] {
    const rows = getDb()
      .prepare(
        `SELECT label, uses, created_at AS lastUsed, grams, portion, source,
                kcal, protein, carbs, fat
           FROM (
             SELECT *,
                    ROW_NUMBER() OVER (PARTITION BY label ORDER BY created_at DESC) AS rn,
                    COUNT(*)     OVER (PARTITION BY label)                          AS uses
               FROM macro_entries
              WHERE TRIM(label) <> ''
           )
          WHERE rn = 1
          ORDER BY lastUsed DESC
          LIMIT ?`,
      )
      .all(limit) as unknown as PastEntry[];
    return rows;
  },
};
