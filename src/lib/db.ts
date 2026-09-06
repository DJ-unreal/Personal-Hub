import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { encryptJSON } from "@/lib/crypto";

/* =====================================================================
   SQLite data layer — Personal Hub (brief step 2).

   Driver: Node 24's built-in `node:sqlite` (DatabaseSync). Synchronous,
   zero-install. All DB access goes through this module so the driver can
   be swapped later (e.g. better-sqlite3 in a Linux Docker image) without
   touching the repos or routes.

   Single file store at ./data/hub.db — single-user, zero-ops per the brief.
   ===================================================================== */

// node:sqlite is stable-enough on Node 24 but still emits one
// ExperimentalWarning on first use. Silence just that one line; leave all
// other process warnings untouched.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const msg = typeof warning === "string" ? warning : warning?.message;
  const type =
    typeof args[0] === "string"
      ? args[0]
      : (args[0] as { type?: string } | undefined)?.type;
  if (type === "ExperimentalWarning" && msg && /SQLite/i.test(msg)) return;
  return originalEmitWarning(warning as string, ...(args as []));
};

/* Where the single-file store lives.
   IMPORTANT: keep this OUT of a cloud-synced folder (OneDrive, Dropbox,
   iCloud…). Sync clients copy the .db independently of its -wal/-shm
   sidecars, which risks a corrupt or silently empty database, and they do
   not merge concurrent writes from two machines. Set HUB_DATA_DIR to a
   local path; it falls back to ./data for a fresh checkout. */
const DATA_DIR = process.env.HUB_DATA_DIR?.trim() || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "hub.db");

function createDb(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS list_items (
      id         TEXT PRIMARY KEY,
      list       TEXT NOT NULL CHECK (list IN ('personal','work','shopping')),
      text       TEXT NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_links (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      url        TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS macro_entries (
      id         TEXT PRIMARY KEY,
      day        TEXT NOT NULL,
      kcal       REAL NOT NULL DEFAULT 0,
      protein    REAL NOT NULL DEFAULT 0,
      carbs      REAL NOT NULL DEFAULT 0,
      fat        REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_macro_entries_day ON macro_entries (day);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Saved meals: a named combination of ingredients, e.g. a protein shake.
    CREATE TABLE IF NOT EXISTS recipes (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id        TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL DEFAULT 0,
      label     TEXT NOT NULL,
      portion   TEXT,
      grams     REAL,
      kcal      REAL NOT NULL DEFAULT 0,
      protein   REAL NOT NULL DEFAULT 0,
      carbs     REAL NOT NULL DEFAULT 0,
      fat       REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe
      ON recipe_items (recipe_id, position);
  `);

  migrateBudgetTable(db);
  migrateMacroEntries(db);
  migrateCalendarAccounts(db);
}

/* Google Calendar started as a single connection stored under one settings
   key. Multiple accounts need a table; move any existing token blob across
   so an already-connected account survives the upgrade. The blob stays
   encrypted throughout — it is copied, never decrypted, here. */
function migrateCalendarAccounts(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_accounts (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL DEFAULT '',
      enc        TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_accounts_email
      ON calendar_accounts (email) WHERE email <> '';
  `);

  const legacy = db
    .prepare("SELECT value FROM settings WHERE key = 'google_calendar_tokens'")
    .get() as { value: string } | undefined;
  if (!legacy) return;

  const already = (
    db.prepare("SELECT COUNT(*) AS n FROM calendar_accounts").get() as {
      n: number;
    }
  ).n;
  if (already === 0) {
    // email is backfilled on the next Calendar API call.
    db.prepare(
      "INSERT INTO calendar_accounts (id, email, enc, created_at) VALUES (?, '', ?, ?)",
    ).run(newId(), legacy.value, Date.now());
  }
  db.prepare("DELETE FROM settings WHERE key = 'google_calendar_tokens'").run();
}

/* Macro entries originally stored bare numbers. The tracker (step 8) needs
   to show WHAT was eaten, so add label/grams/source in place. */
function migrateMacroEntries(db: DatabaseSync) {
  const cols = (
    db.prepare("PRAGMA table_info(macro_entries)").all() as { name: string }[]
  ).map((c) => c.name);
  if (cols.length === 0) return; // table created fresh above with no extras

  if (!cols.includes("label")) {
    db.exec("ALTER TABLE macro_entries ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.includes("grams")) {
    db.exec("ALTER TABLE macro_entries ADD COLUMN grams REAL");
  }
  if (!cols.includes("source")) {
    db.exec("ALTER TABLE macro_entries ADD COLUMN source TEXT");
  }
  // Portions can now be entered in ml or servings, not just grams; keep the
  // text the user actually chose for display ("330 ml", "1 × serving").
  if (!cols.includes("portion")) {
    db.exec("ALTER TABLE macro_entries ADD COLUMN portion TEXT");
  }
}

/* Budget is a protected module — its rows are stored AES-256-GCM encrypted
   (one blob per line). This creates the encrypted table, and migrates any
   pre-encryption plaintext rows (from earlier build steps) in place. */
function migrateBudgetTable(db: DatabaseSync) {
  const cols = db
    .prepare("PRAGMA table_info(budget_lines)")
    .all() as { name: string }[];
  const names = cols.map((c) => c.name);

  if (names.length === 0) {
    db.exec(`
      CREATE TABLE budget_lines (
        id         TEXT PRIMARY KEY,
        enc        TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    return;
  }

  // Already migrated (has the `enc` column) → nothing to do.
  if (names.includes("enc")) return;

  // Old plaintext schema → encrypt each row into the new table, then swap.
  db.exec(`
    CREATE TABLE budget_lines_enc (
      id         TEXT PRIMARY KEY,
      enc        TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const rows = db
    .prepare("SELECT id, label, amount, type, created_at FROM budget_lines")
    .all() as unknown as {
    id: string;
    label: string;
    amount: number;
    type: "income" | "expense";
    created_at: number;
  }[];
  const ins = db.prepare(
    "INSERT INTO budget_lines_enc (id, enc, created_at) VALUES (?, ?, ?)",
  );
  for (const r of rows) {
    ins.run(
      r.id,
      encryptJSON({ label: r.label, amount: r.amount, type: r.type }),
      r.created_at,
    );
  }
  db.exec("DROP TABLE budget_lines;");
  db.exec("ALTER TABLE budget_lines_enc RENAME TO budget_lines;");
}

/* Seed each table only if it is empty (first run), matching the prototype's
   starting content so the hub isn't blank on first launch. Safe to delete. */
function seed(db: DatabaseSync) {
  const now = Date.now();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  if (count("list_items") === 0) {
    const ins = db.prepare(
      "INSERT INTO list_items (id, list, text, done, created_at) VALUES (?, ?, ?, 0, ?)",
    );
    ins.run(newId(), "personal", "Book dentist", now);
    ins.run(newId(), "work", "Review deployment runbook", now + 1);
    ins.run(newId(), "shopping", "Oat milk", now + 2);
  }

  if (count("budget_lines") === 0) {
    const ins = db.prepare(
      "INSERT INTO budget_lines (id, enc, created_at) VALUES (?, ?, ?)",
    );
    const addLine = (
      label: string,
      amount: number,
      type: "income" | "expense",
      created: number,
    ) => ins.run(newId(), encryptJSON({ label, amount, type }), created);
    addLine("Salary", 3200, "income", now);
    addLine("Rent", 1150, "expense", now + 1);
    addLine("Groceries", 400, "expense", now + 2);
    addLine("Transport", 90, "expense", now + 3);
  }

  if (count("quick_links") === 0) {
    const ins = db.prepare(
      "INSERT INTO quick_links (id, label, url, created_at) VALUES (?, ?, ?, ?)",
    );
    ins.run(newId(), "Bank", "https://example.com", now);
    ins.run(newId(), "Health insurance", "https://example.com", now + 1);
    ins.run(newId(), "Investments", "https://example.com", now + 2);
    ins.run(newId(), "Calendar", "https://example.com", now + 3);
  }

  // Macro targets live in settings so they can be edited later (brief step 8).
  const hasTargets = db
    .prepare("SELECT 1 FROM settings WHERE key = 'macro_targets'")
    .get();
  if (!hasTargets) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "macro_targets",
      JSON.stringify({ kcal: 2200, protein: 160, carbs: 220, fat: 70 }),
    );
  }
}

/* Opaque, collision-free ids generated server-side. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/* Cache the connection across dev hot-reloads so we don't reopen the file
   on every module re-evaluation. */
const globalForDb = globalThis as unknown as { __hubDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__hubDb) {
    globalForDb.__hubDb = createDb();
  }
  return globalForDb.__hubDb;
}
