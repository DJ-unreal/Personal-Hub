"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  X,
  Check,
  Mail,
  ExternalLink,
  Search,
  Snowflake,
  CloudRain,
  Thermometer,
  AlertTriangle,
  Trash2,
  Lock,
  LogOut,
  Calendar,
  FileText,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { api } from "@/lib/api";
import {
  useBudget,
  useCalendar,
  useHealthDocs,
  useLinks,
  useListItems,
  useMacros,
  useSession,
  useWeather,
} from "@/lib/hooks";
import type { ListName, ProtectedModule, WeatherWarningKind } from "@/lib/types";

/* =====================================================================
   Personal Hub — shell + modules.

   Data-backed via the SQLite API (see src/lib/hooks.ts): weather (live,
   Open-Meteo), To-do, Shopping, Budget, Quick links, Macros. The whole hub
   sits behind a master login; Budget and Health are additionally gated by
   per-module passcodes with a server-tracked idle auto-relock (step 5).
   Calendar and Health contents remain MOCK — Google OAuth (step 6) and
   health docs (step 7) come later. Budget rows are encrypted at rest.
   ===================================================================== */

const round = (n: number) => Math.round(n);

/* Small shared bits for the data-backed modules. */
function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="py-2 font-mono text-[11px] text-gray-400">{label}</div>;
}

// Errors render as an inverted black pill, per the design language.
function ErrorNote({ message }: { message: string }) {
  return (
    <div className="mt-2 inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
      <AlertTriangle size={12} strokeWidth={2} /> {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Protected modules — real passcode gate (server session)            */
/* ------------------------------------------------------------------ */
function LockChip({ secs, onLock }: { secs: number; onLock: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[11px] text-gray-400" title="Auto-relocks when idle">
        {secs}s
      </span>
      <button
        onClick={onLock}
        className="inline-flex items-center gap-1 border border-gray-300 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:border-gray-900"
      >
        <Lock size={10} /> Lock
      </button>
    </span>
  );
}

function LockBody({
  onUnlock,
}: {
  onUnlock: (code: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const e = await onUnlock(code);
    setBusy(false);
    if (e) {
      setErr(e);
      setCode("");
    }
  };
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center border border-gray-900">
        <Lock size={18} strokeWidth={2} />
      </div>
      <div className="mt-3 text-sm text-gray-800">Protected</div>
      <div className="mt-1 text-xs text-gray-400">Enter passcode to view</div>
      <div className="mt-4 flex gap-2">
        <input
          type="password"
          value={code}
          disabled={busy}
          onChange={(e) => {
            setCode(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
          className="w-28 border border-gray-300 px-2 py-1.5 text-center font-mono text-sm tracking-widest focus:border-gray-900 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Unlock
        </button>
      </div>
      {err && (
        <div className="mt-2 font-mono text-[11px] text-gray-900">{err}</div>
      )}
      <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-gray-400">
        Auto-relocks after idle
      </div>
    </div>
  );
}

function LockedCard({
  label,
  onUnlock,
}: {
  label: string;
  onUnlock: (code: string) => Promise<string | null>;
}) {
  return (
    <Card label={label} right={<Lock size={13} className="text-gray-400" />}>
      <LockBody onUnlock={onUnlock} />
    </Card>
  );
}

/* Wraps a protected card so any interaction resets the server idle timer
   (throttled). "Activity" per the brief's reset-on-activity relock. */
function ActivityBoundary({
  onActivity,
  children,
}: {
  onActivity: () => void;
  children: ReactNode;
}) {
  const last = useRef(0);
  const fire = () => {
    const now = Date.now();
    if (now - last.current > 5000) {
      last.current = now;
      onActivity();
    }
  };
  return (
    <div onPointerDownCapture={fire} onKeyDownCapture={fire}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Weather  (live — Open-Meteo via /api/weather)                      */
/* ------------------------------------------------------------------ */
const WARNING_ICON: Record<WeatherWarningKind, LucideIcon> = {
  rain: CloudRain,
  snow: Snowflake,
  hail: AlertTriangle,
  cold: Thermometer,
  heat: Thermometer,
};

function WeatherCard() {
  const { weather, loading, error } = useWeather();

  return (
    <Card label="Weather" right={weather?.location ?? "Regensburg"}>
      {loading ? (
        <Loading />
      ) : error ? (
        <>
          <div className="font-mono text-sm text-gray-500">Unavailable</div>
          <ErrorNote message={error} />
        </>
      ) : weather ? (
        <>
          <div className="flex items-end justify-between">
            <div>
              <div className="font-mono text-5xl font-bold leading-none tracking-tight">
                {weather.temp}°
              </div>
              <div className="mt-2 text-sm text-gray-600">
                {weather.description} · feels {weather.feelsLike}° · wind{" "}
                {weather.wind} km/h
              </div>
            </div>
            <div className="text-right font-mono text-xs text-gray-500">
              <div>H {weather.high}°</div>
              <div>L {weather.low}°</div>
            </div>
          </div>
          {weather.warnings.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {weather.warnings.map((w, i) => {
                const Icon = WARNING_ICON[w.kind];
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white"
                  >
                    <Icon size={12} strokeWidth={2} />
                    {w.text}
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-gray-400">
            Updated{" "}
            {new Date(weather.updatedAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Calendar — today  (live — Google Calendar OAuth)                   */
/* ------------------------------------------------------------------ */
function CalendarCard() {
  const { status, accounts, events, loading, error, connect, disconnect } =
    useCalendar();
  const [managing, setManaging] = useState(false);

  // Only worth labelling each event once more than one account is connected.
  const showAccounts = accounts.length > 1;

  const right = status?.connected ? (
    <button
      onClick={() => setManaging((m) => !m)}
      className="font-mono text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-900"
    >
      {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
    </button>
  ) : undefined;

  return (
    <Card label="Today" right={right}>
      {loading ? (
        <Loading />
      ) : !status?.configured ? (
        <p className="py-2 text-xs text-gray-400">
          Google Calendar isn&apos;t configured. Add OAuth credentials to{" "}
          <span className="font-mono">.env.local</span> to enable today&apos;s
          agenda.
        </p>
      ) : !status.connected ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-xs text-gray-600">
            Connect your Google Calendar to see today&apos;s agenda.
          </p>
          <button
            onClick={connect}
            className="inline-flex items-center gap-1 bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700"
          >
            <Calendar size={13} /> Connect Google Calendar
          </button>
        </div>
      ) : (
        <>
          {managing && (
            <div className="mb-3 border border-gray-200">
              <div className="border-b border-gray-200 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-gray-400">
                Connected accounts
              </div>
              <ul>
                {accounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <span className="truncate font-mono text-[11px] text-gray-600">
                      {a.email || "(identifying…)"}
                    </span>
                    <button
                      onClick={() => disconnect(a.id)}
                      className="shrink-0 border border-gray-300 px-2 py-0.5 font-mono text-[10px] text-gray-600 hover:border-gray-900"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2">
                <button
                  onClick={connect}
                  className="inline-flex items-center gap-1 border border-gray-900 px-2 py-1 font-mono text-[11px] text-gray-900 hover:bg-gray-900 hover:text-white"
                >
                  <Plus size={12} /> Add another account
                </button>
              </div>
            </div>
          )}
          <ul>
            {events.length === 0 && (
              <li className="py-2 text-xs text-gray-400">Nothing scheduled.</li>
            )}
            {events.map((ev) => (
              <li key={ev.id}>
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0 hover:bg-gray-50"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-gray-500">
                    {ev.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800">
                      {ev.name}
                    </span>
                    {showAccounts && ev.accountEmail && (
                      <span className="block truncate font-mono text-[10px] text-gray-400">
                        {ev.accountEmail}
                      </span>
                    )}
                  </span>
                  <ExternalLink
                    size={13}
                    className="shrink-0 text-gray-300 group-hover:text-gray-600"
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <ErrorNote message={error} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Macros — today  (SQLite-backed)                                    */
/* ------------------------------------------------------------------ */
function Bar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="h-1.5 w-full bg-gray-200">
      <div className="h-full bg-gray-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MacrosCard() {
  const { summary, loading, error, add } = useMacros();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ kcal: "", p: "", c: "", f: "" });

  const submit = async () => {
    const m = {
      kcal: Number(draft.kcal) || 0,
      protein: Number(draft.p) || 0,
      carbs: Number(draft.c) || 0,
      fat: Number(draft.f) || 0,
    };
    if (m.kcal <= 0 && m.protein <= 0 && m.carbs <= 0 && m.fat <= 0) return;
    const ok = await add(m);
    if (ok) {
      setDraft({ kcal: "", p: "", c: "", f: "" });
      setOpen(false);
    }
  };

  const totals = summary?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const targets = summary?.targets ?? {
    kcal: 2200,
    protein: 160,
    carbs: 220,
    fat: 70,
  };
  const rows: [string, number, number, string][] = [
    ["Protein", totals.protein, targets.protein, "g"],
    ["Carbs", totals.carbs, targets.carbs, "g"],
    ["Fat", totals.fat, targets.fat, "g"],
  ];

  return (
    <Card
      label="Macros · Today"
      right={
        <span className="inline-flex items-center gap-3">
          <Link
            href="/macros"
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            Tracker <ArrowRight size={12} />
          </Link>
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            <Plus size={13} /> Log
          </button>
        </span>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="font-mono text-3xl font-bold tracking-tight">
                {round(totals.kcal)}
              </span>
              <span className="ml-1 font-mono text-sm text-gray-400">
                / {round(targets.kcal)} kcal
              </span>
            </div>
            <span className="font-mono text-xs text-gray-500">
              {Math.max(0, round(targets.kcal - totals.kcal))} left
            </span>
          </div>
          <div className="mt-2">
            <Bar value={totals.kcal} target={targets.kcal} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4">
            {rows.map(([name, val, tgt, unit]) => (
              <div key={name}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-600">{name}</span>
                  <span className="font-mono text-xs text-gray-500">
                    {round(val)}/{round(tgt)}
                    {unit}
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

      {error && <ErrorNote message={error} />}

      {open && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-4 gap-2">
            {(["kcal", "p", "c", "f"] as const).map((k) => (
              <div key={k}>
                <label className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                  {k}
                </label>
                <input
                  type="number"
                  value={draft[k]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [k]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="mt-1 w-full border border-gray-300 px-2 py-1 font-mono text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            className="mt-3 bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700"
          >
            Add to today
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">
        Summary tile — search foods, scan barcodes and review the day in the
        tracker.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  To-do (Personal + Work) & Shopping  (SQLite-backed)                */
/* ------------------------------------------------------------------ */
function TodoList({ title, list }: { title: string; list: ListName }) {
  const { items, loading, error, add, toggle, remove } = useListItems(list);
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    add(t);
    setText("");
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-gray-500">
          {title}
        </span>
        <span className="font-mono text-[11px] text-gray-400">
          {items.filter((i) => !i.done).length} open
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add a task…"
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          onClick={submit}
          className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Plus size={16} />
        </button>
      </div>
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <ul className="mt-3 space-y-1">
          {items.length === 0 && (
            <li className="py-2 text-xs text-gray-400">Nothing here yet.</li>
          )}
          {items.map((it) => (
            <li key={it.id} className="group flex items-center gap-2 py-1">
              <button
                onClick={() => toggle(it.id, !it.done)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                  it.done
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-400"
                }`}
              >
                {it.done && <Check size={11} strokeWidth={3} />}
              </button>
              <span
                className={`flex-1 text-sm ${
                  it.done ? "text-gray-400 line-through" : "text-gray-800"
                }`}
              >
                {it.text}
              </span>
              <button
                onClick={() => remove(it.id)}
                className="opacity-0 group-hover:opacity-100"
              >
                <X size={14} className="text-gray-400 hover:text-gray-900" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TodoCard() {
  return (
    <Card label="To-do">
      <div className="space-y-6">
        <TodoList title="Personal" list="personal" />
        <div className="border-t border-gray-200" />
        <TodoList title="Work" list="work" />
      </div>
    </Card>
  );
}

function ShoppingCard() {
  return (
    <Card label="Shopping">
      <TodoList title="Items" list="shopping" />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Budget (manual — this month)  (SQLite-backed; encryption = step 5) */
/* ------------------------------------------------------------------ */
function BudgetCard({
  secsLeft,
  onLock,
}: {
  secsLeft: number;
  onLock: () => void;
}) {
  const { lines, loading, error, add, remove } = useBudget();
  const [draft, setDraft] = useState<{
    label: string;
    amount: string;
    type: "income" | "expense";
  }>({ label: "", amount: "", type: "expense" });

  const income = lines
    .filter((l) => l.type === "income")
    .reduce((s, l) => s + l.amount, 0);
  const expense = lines
    .filter((l) => l.type === "expense")
    .reduce((s, l) => s + l.amount, 0);
  const remaining = income - expense;

  const submit = async () => {
    const amt = Number(draft.amount);
    if (!draft.label.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const ok = await add(draft.label.trim(), amt, draft.type);
    if (ok) setDraft({ label: "", amount: "", type: "expense" });
  };
  const fmt = (n: number) => "€" + n.toLocaleString("de-DE");

  return (
    <Card
      label="Budget · This month"
      right={
        <span className="inline-flex items-center gap-3">
          <span
            className={remaining >= 0 ? "text-gray-900" : "font-bold text-gray-900"}
          >
            {fmt(remaining)} left
          </span>
          <LockChip secs={secsLeft} onLock={onLock} />
        </span>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="border border-gray-200 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
            In
          </div>
          <div className="font-mono text-lg">{fmt(income)}</div>
        </div>
        <div className="border border-gray-200 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
            Out
          </div>
          <div className="font-mono text-lg">{fmt(expense)}</div>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <ul className="space-y-1">
          {lines.length === 0 && (
            <li className="py-2 text-xs text-gray-400">No lines yet.</li>
          )}
          {lines.map((l) => (
            <li
              key={l.id}
              className="group flex items-center justify-between border-b border-gray-100 py-1.5"
            >
              <span className="flex items-center gap-2 text-sm text-gray-800">
                <span
                  className={`h-2 w-2 shrink-0 ${
                    l.type === "income"
                      ? "bg-gray-900"
                      : "border border-gray-400"
                  }`}
                />
                {l.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-gray-700">
                  {l.type === "expense" ? "−" : "+"}
                  {fmt(l.amount)}
                </span>
                <button
                  onClick={() => remove(l.id)}
                  className="opacity-0 group-hover:opacity-100"
                >
                  <Trash2
                    size={13}
                    className="text-gray-400 hover:text-gray-900"
                  />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          placeholder="Item"
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <input
          type="number"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="€"
          className="w-20 border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          onClick={() =>
            setDraft((d) => ({
              ...d,
              type: d.type === "expense" ? "income" : "expense",
            }))
          }
          className="w-24 shrink-0 border border-gray-300 px-2 font-mono text-xs text-gray-600 hover:border-gray-900"
          title="Toggle income / expense"
        >
          {draft.type}
        </button>
        <button
          onClick={submit}
          className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Plus size={16} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Health documents  (live — files on the user's own disk)            */
/* ------------------------------------------------------------------ */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function HealthCard({
  secsLeft,
  onLock,
}: {
  secsLeft: number;
  onLock: () => void;
}) {
  const {
    docs,
    configured,
    mailConfigured,
    loading,
    error,
    pending,
    sending,
    sent,
    mailError,
    prepareEmail,
    confirmSend,
    cancelEmail,
  } = useHealthDocs();
  const [q, setQ] = useState("");
  const [emailedId, setEmailedId] = useState<string | null>(null);
  const [to, setTo] = useState("");

  const closeEmail = () => {
    setEmailedId(null);
    setTo("");
    cancelEmail();
  };

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? docs.filter((d) => d.name.toLowerCase().includes(needle))
    : docs;

  return (
    <Card
      label="Health records"
      right={
        <span className="inline-flex items-center gap-2">
          {!loading && configured && (
            <span className="font-mono text-[11px] text-gray-400">
              {docs.length} {docs.length === 1 ? "file" : "files"}
            </span>
          )}
          <LockChip secs={secsLeft} onLock={onLock} />
        </span>
      }
    >
      {loading ? (
        <Loading />
      ) : !configured ? (
        <p className="py-2 text-xs text-gray-400">
          No documents folder configured. Set{" "}
          <span className="font-mono">HEALTH_DOCS_DIR</span> in{" "}
          <span className="font-mono">.env.local</span> to the folder holding
          your records.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 border border-gray-300 px-2">
            <Search size={14} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className="w-full bg-transparent py-1.5 text-sm focus:outline-none"
            />
          </div>
          <ul className="space-y-2">
            {filtered.map((d) => (
              <li key={d.id} className="border border-gray-200">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <a
                    href={api.healthDocs.fileUrl(d.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group min-w-0 flex-1"
                    title="Open document"
                  >
                    <div className="flex items-center gap-2">
                      <FileText
                        size={13}
                        className="shrink-0 text-gray-400 group-hover:text-gray-900"
                      />
                      <span className="truncate text-sm text-gray-900 group-hover:underline">
                        {d.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex gap-2 pl-[21px] font-mono text-[10px] text-gray-400">
                      <span className="uppercase tracking-wider">{d.ext}</span>
                      <span>· {formatSize(d.size)}</span>
                      <span>
                        ·{" "}
                        {new Date(d.modified).toLocaleDateString("en-GB", {
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </a>
                  <div className="flex shrink-0 gap-1">
                    <a
                      href={api.healthDocs.fileUrl(d.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                    <button
                      onClick={() =>
                        emailedId === d.id ? closeEmail() : (closeEmail(), setEmailedId(d.id))
                      }
                      className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                    >
                      <Mail size={12} /> Email
                    </button>
                  </div>
                </div>

                {emailedId === d.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
                    {!mailConfigured ? (
                      <p className="text-xs text-gray-400">
                        Email isn&apos;t configured. Add{" "}
                        <span className="font-mono">SMTP_USER</span> /{" "}
                        <span className="font-mono">SMTP_PASS</span> to{" "}
                        <span className="font-mono">.env.local</span>.
                      </p>
                    ) : pending ? (
                      /* ---- Confirmation step: nothing has been sent yet ---- */
                      <div>
                        <div className="inline-flex items-start gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
                          <AlertTriangle
                            size={12}
                            strokeWidth={2}
                            className="mt-px shrink-0"
                          />
                          Confirm before sending
                        </div>
                        <dl className="mt-2 space-y-0.5 font-mono text-[11px] text-gray-600">
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-gray-400">File</dt>
                            <dd className="truncate text-gray-800">
                              {pending.filename} ({formatSize(pending.size)})
                            </dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-gray-400">To</dt>
                            <dd className="truncate text-gray-800">{pending.to}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-gray-400">From</dt>
                            <dd className="truncate">{pending.from}</dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={confirmSend}
                            disabled={sending}
                            className="bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                          >
                            {sending ? "Sending…" : "Send now"}
                          </button>
                          <button
                            onClick={cancelEmail}
                            disabled={sending}
                            className="border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-600 hover:border-gray-900 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ---- Step 1: choose a recipient (sends nothing) ---- */
                      <div>
                        <label className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                          Send a copy to
                        </label>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="email"
                            value={to}
                            autoFocus
                            onChange={(e) => setTo(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              to.trim() &&
                              prepareEmail(d.id, to.trim())
                            }
                            placeholder="name@example.com"
                            className="w-full border border-gray-300 bg-transparent px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                          />
                          <button
                            onClick={() => to.trim() && prepareEmail(d.id, to.trim())}
                            className="shrink-0 border border-gray-900 px-3 font-mono text-xs text-gray-900 hover:bg-gray-900 hover:text-white"
                          >
                            Review
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-400">
                          You&apos;ll see exactly what gets sent, and to whom,
                          before anything leaves.
                        </p>
                      </div>
                    )}
                    {sent && (
                      <div className="mt-2 font-mono text-[11px] text-gray-800">
                        ✓ {sent}
                      </div>
                    )}
                    {mailError && <ErrorNote message={mailError} />}
                  </div>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-2 text-xs text-gray-400">
                {docs.length === 0
                  ? "No documents in the folder yet."
                  : "No documents match."}
              </li>
            )}
          </ul>
        </>
      )}
      {error && <ErrorNote message={error} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick links  (SQLite-backed)                                       */
/* ------------------------------------------------------------------ */
function LinksCard() {
  const { links, loading, error, add, remove } = useLinks();
  const [draft, setDraft] = useState({ label: "", url: "" });

  const submit = async () => {
    if (!draft.label.trim() || !draft.url.trim()) return;
    const ok = await add(draft.label.trim(), draft.url.trim());
    if (ok) setDraft({ label: "", url: "" });
  };

  return (
    <Card label="Quick links">
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {links.map((l) => (
            <div key={l.id} className="group relative">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between border border-gray-200 px-3 py-2.5 text-sm text-gray-800 hover:border-gray-900"
              >
                {l.label}
                <ExternalLink size={13} className="text-gray-400" />
              </a>
              <button
                onClick={() => remove(l.id)}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center border border-gray-300 bg-white group-hover:flex"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <div className="py-2 text-xs text-gray-400">No links yet.</div>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          placeholder="Label"
          className="w-32 border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <input
          value={draft.url}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="example.com"
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          onClick={submit}
          className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Plus size={16} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Master login gate + loading splash                                 */
/* ------------------------------------------------------------------ */
function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="font-mono text-[11px] uppercase tracking-widest text-gray-400">
        Loading…
      </div>
    </div>
  );
}

function LoginGate({
  onLogin,
}: {
  onLogin: (pw: string) => Promise<string | null>;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || !pw) return;
    setBusy(true);
    const e = await onLogin(pw);
    setBusy(false);
    if (e) {
      setErr(e);
      setPw("");
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-gray-900">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 border-b border-gray-900 pb-4">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-gray-400">
            Personal
          </div>
          <h1 className="font-mono text-3xl font-bold tracking-tight">HUB</h1>
        </div>
        <div className="flex items-center gap-2 border border-gray-900 px-3 py-2">
          <Lock size={16} />
          <input
            type="password"
            autoFocus
            value={pw}
            disabled={busy}
            onChange={(e) => {
              setPw(e.target.value);
              setErr(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Master password"
            className="w-full py-1 font-mono text-sm focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="mt-3 w-full bg-gray-900 px-3 py-2 font-mono text-xs uppercase tracking-widest text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock hub"}
        </button>
        {err && (
          <div className="mt-3 font-mono text-[11px] text-gray-900">{err}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */
const PROTECTED: ProtectedModule[] = ["budget", "health"];

export default function PersonalHub() {
  const session = useSession();

  // Greeting/date derived client-side after mount to avoid an SSR/client
  // hydration mismatch on the timestamp.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  if (session.loading) return <Splash />;
  if (!session.authed) return <LoginGate onLogin={session.login} />;

  const hr = now?.getHours() ?? 0;
  const greeting =
    now == null
      ? "Hello"
      : hr < 12
        ? "Good morning"
        : hr < 18
          ? "Good afternoon"
          : "Good evening";
  const dateStr =
    now?.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) ?? "";

  const protectedCount = PROTECTED.filter((m) => !session.open(m)).length;
  const anyOpen = protectedCount < 2;

  return (
    <div className="min-h-screen bg-canvas text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between border-b border-gray-900 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-gray-400">
              Personal
            </div>
            <h1 className="font-mono text-3xl font-bold tracking-tight">HUB</h1>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-800">{greeting}, Dillon</div>
            <div className="font-mono text-xs text-gray-400">{dateStr}</div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-400">
                <Lock size={11} /> {protectedCount} protected
              </span>
              {anyOpen && (
                <button
                  onClick={() => session.lockAll()}
                  className="inline-flex items-center gap-1 border border-gray-300 px-2 py-0.5 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                >
                  <Lock size={11} /> Lock all
                </button>
              )}
              <button
                onClick={() => session.logout()}
                className="inline-flex items-center gap-1 border border-gray-300 px-2 py-0.5 font-mono text-[11px] text-gray-600 hover:border-gray-900"
              >
                <LogOut size={11} /> Log out
              </button>
            </div>
          </div>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <WeatherCard />
            <CalendarCard />
          </div>
          <div className="lg:col-span-2">
            <MacrosCard />
          </div>
          <div className="space-y-4 lg:col-span-1">
            <TodoCard />
            <ShoppingCard />
          </div>
          <div className="lg:col-span-1">
            {session.open("budget") ? (
              <ActivityBoundary onActivity={() => session.touch("budget")}>
                <BudgetCard
                  secsLeft={session.secsLeft("budget")}
                  onLock={() => session.lock("budget")}
                />
              </ActivityBoundary>
            ) : (
              <LockedCard
                label="Budget · This month"
                onUnlock={(c) => session.unlock("budget", c)}
              />
            )}
          </div>
          <div className="lg:col-span-1">
            {session.open("health") ? (
              <ActivityBoundary onActivity={() => session.touch("health")}>
                <HealthCard
                  secsLeft={session.secsLeft("health")}
                  onLock={() => session.lock("health")}
                />
              </ActivityBoundary>
            ) : (
              <LockedCard
                label="Health records"
                onUnlock={(c) => session.unlock("health", c)}
              />
            )}
          </div>
          <div className="lg:col-span-3">
            <LinksCard />
          </div>
        </div>

        <footer className="mt-8 border-t border-gray-200 pt-4 font-mono text-[11px] text-gray-400">
          Master login · Budget &amp; Health passcode-gated, encrypted at rest,
          idle auto-relock · health files stay on your own disk
        </footer>
      </div>
    </div>
  );
}
