import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, X, Check, Mail, ExternalLink, Search,
  Snowflake, CloudRain, Thermometer, AlertTriangle, Trash2, Lock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Persistence: one key per module, personal (shared=false).          */
/*  Falls back to in-memory state if window.storage isn't available.   */
/* ------------------------------------------------------------------ */
function usePersisted(key, initial) {
  const [val, setVal] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.storage) {
          const r = await window.storage.get(key, false);
          if (alive && r && r.value != null) setVal(JSON.parse(r.value));
        }
      } catch (e) {
        /* key doesn't exist yet — keep initial */
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.storage) {
          await window.storage.set(key, JSON.stringify(val), false);
        }
      } catch (e) {
        console.error("save failed:", key, e);
      }
    })();
  }, [val, loaded, key]);

  return [val, setVal];
}

const uid = () => Math.random().toString(36).slice(2, 9);

/* ------------------------------------------------------------------ */
/*  Shared card shell                                                  */
/* ------------------------------------------------------------------ */
function Card({ label, right, children, className = "" }) {
  return (
    <section className={`border border-gray-200 bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">{label}</h2>
        {right != null && <div className="font-mono text-xs text-gray-400">{right}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Sample() {
  return (
    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-gray-400 border border-gray-300 px-1 py-0.5 align-middle">
      sample
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Protected modules — prototype passcode gate                        */
/*  NOTE: mock lock for the prototype only. Real auth + encryption      */
/*  come in the real build; the code below protects nothing real.       */
/* ------------------------------------------------------------------ */
const LOCK_MS = 60000; // 60s auto-relock (prototype). Real build: longer, and resets on activity.
const CODES = { budget: "1234", health: "5678" };

function LockChip({ secs, onLock }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[11px] text-gray-400">{secs}s</span>
      <button onClick={onLock} className="inline-flex items-center gap-1 border border-gray-300 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 hover:border-gray-900">
        <Lock size={10} /> Lock
      </button>
    </span>
  );
}

function LockBody({ hint, onUnlock }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (!onUnlock(code)) { setErr(true); setCode(""); }
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
          onChange={(e) => { setCode(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
          className="w-28 border border-gray-300 px-2 py-1.5 text-center font-mono text-sm tracking-widest focus:border-gray-900 focus:outline-none"
        />
        <button onClick={submit} className="bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700">
          Unlock
        </button>
      </div>
      {err && <div className="mt-2 font-mono text-[11px] text-gray-900">Incorrect passcode</div>}
      <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-gray-400">Prototype lock · demo code {hint}</div>
    </div>
  );
}

function LockedCard({ label, hint, onUnlock }) {
  return (
    <Card label={label} right={<Lock size={13} className="text-gray-400" />}>
      <LockBody hint={hint} onUnlock={onUnlock} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Weather                                                            */
/* ------------------------------------------------------------------ */
function WeatherCard() {
  // Sample data — live source (Open-Meteo, keyless) gets wired in the real build.
  const warnings = [
    { icon: CloudRain, text: "Rain after 15:00" },
    { icon: Snowflake, text: "Sleet risk overnight" },
    { icon: Thermometer, text: "Low 2°C" },
  ];
  return (
    <Card label="Weather" right="Regensburg">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-5xl font-bold leading-none tracking-tight">7°</div>
          <div className="mt-2 text-sm text-gray-600">Overcast, light wind</div>
        </div>
        <div className="text-right font-mono text-xs text-gray-500">
          <div>H 9°</div>
          <div>L 2°</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {warnings.map((w, i) => {
          const Icon = w.icon;
          return (
            <span key={i} className="inline-flex items-center gap-1 bg-gray-900 px-2 py-1 font-mono text-[11px] text-white">
              <Icon size={12} strokeWidth={2} />
              {w.text}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-400">Sample forecast — live data connects when this moves to a real build.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Calendar — today                                                   */
/* ------------------------------------------------------------------ */
const CAL_EVENTS = [
  { time: "09:00", name: "Team stand-up", url: "https://calendar.google.com/" },
  { time: "11:30", name: "Deploy review", url: "https://calendar.google.com/" },
  { time: "14:00", name: "Dentist", url: "https://calendar.google.com/" },
  { time: "18:30", name: "Gym", url: "https://calendar.google.com/" },
];

function CalendarCard() {
  return (
    <Card label="Today" right={<Sample />}>
      <ul>
        {CAL_EVENTS.length === 0 && <li className="py-2 text-xs text-gray-400">Nothing scheduled.</li>}
        {CAL_EVENTS.map((ev, i) => (
          <li key={i}>
            <a
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0 hover:bg-gray-50"
            >
              <span className="w-12 shrink-0 font-mono text-xs text-gray-500">{ev.time}</span>
              <span className="flex-1 text-sm text-gray-800">{ev.name}</span>
              <ExternalLink size={13} className="text-gray-300 group-hover:text-gray-600" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-400">Sample — each event opens in your calendar app once connected.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Macros                                                             */
/* ------------------------------------------------------------------ */
const MACRO_TARGET = { kcal: 2200, p: 160, c: 220, f: 70 };

function Bar({ value, target }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="h-1.5 w-full bg-gray-200">
      <div className="h-full bg-gray-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MacrosCard() {
  const [totals, setTotals] = usePersisted("macros_today", { kcal: 1180, p: 92, c: 118, f: 34 });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ kcal: "", p: "", c: "", f: "" });

  const add = () => {
    const d = {
      kcal: Number(draft.kcal) || 0,
      p: Number(draft.p) || 0,
      c: Number(draft.c) || 0,
      f: Number(draft.f) || 0,
    };
    setTotals((t) => ({ kcal: t.kcal + d.kcal, p: t.p + d.p, c: t.c + d.c, f: t.f + d.f }));
    setDraft({ kcal: "", p: "", c: "", f: "" });
    setOpen(false);
  };

  const rows = [
    ["Protein", totals.p, MACRO_TARGET.p, "g"],
    ["Carbs", totals.c, MACRO_TARGET.c, "g"],
    ["Fat", totals.f, MACRO_TARGET.f, "g"],
  ];

  return (
    <Card
      label="Macros · Today"
      right={
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <Plus size={13} /> Log
        </button>
      }
    >
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-mono text-3xl font-bold tracking-tight">{totals.kcal}</span>
          <span className="ml-1 font-mono text-sm text-gray-400">/ {MACRO_TARGET.kcal} kcal</span>
        </div>
        <span className="font-mono text-xs text-gray-500">{Math.max(0, MACRO_TARGET.kcal - totals.kcal)} left</span>
      </div>
      <div className="mt-2"><Bar value={totals.kcal} target={MACRO_TARGET.kcal} /></div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        {rows.map(([name, val, tgt, unit]) => (
          <div key={name}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-600">{name}</span>
              <span className="font-mono text-xs text-gray-500">{val}/{tgt}{unit}</span>
            </div>
            <div className="mt-1.5"><Bar value={val} target={tgt} /></div>
          </div>
        ))}
      </div>

      {open && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-4 gap-2">
            {["kcal", "p", "c", "f"].map((k) => (
              <div key={k}>
                <label className="font-mono text-[10px] uppercase tracking-wider text-gray-400">{k}</label>
                <input
                  type="number"
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  className="mt-1 w-full border border-gray-300 px-2 py-1 font-mono text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <button onClick={add} className="mt-3 bg-gray-900 px-3 py-1.5 font-mono text-xs text-white hover:bg-gray-700">
            Add to today
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">Summary tile — full tracker with photo ID lives in the Macros module.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  To-do (Personal + Work)                                            */
/* ------------------------------------------------------------------ */
function TodoList({ title, storageKey, seed }) {
  const [items, setItems] = usePersisted(storageKey, seed);
  const [text, setText] = useState("");

  const addItem = () => {
    const t = text.trim();
    if (!t) return;
    setItems((xs) => [...xs, { id: uid(), text: t, done: false }]);
    setText("");
  };
  const toggle = (id) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  const remove = (id) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-gray-500">{title}</span>
        <span className="font-mono text-[11px] text-gray-400">{items.filter((i) => !i.done).length} open</span>
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add a task…"
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button onClick={addItem} className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white">
          <Plus size={16} />
        </button>
      </div>
      <ul className="mt-3 space-y-1">
        {items.length === 0 && <li className="py-2 text-xs text-gray-400">Nothing here yet.</li>}
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2 py-1">
            <button
              onClick={() => toggle(it.id)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center border ${it.done ? "border-gray-900 bg-gray-900 text-white" : "border-gray-400"}`}
            >
              {it.done && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={`flex-1 text-sm ${it.done ? "text-gray-400 line-through" : "text-gray-800"}`}>{it.text}</span>
            <button onClick={() => remove(it.id)} className="opacity-0 group-hover:opacity-100">
              <X size={14} className="text-gray-400 hover:text-gray-900" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodoCard() {
  return (
    <Card label="To-do">
      <div className="space-y-6">
        <TodoList title="Personal" storageKey="todo_personal" seed={[{ id: "s1", text: "Book dentist", done: false }]} />
        <div className="border-t border-gray-200" />
        <TodoList title="Work" storageKey="todo_work" seed={[{ id: "s2", text: "Review deployment runbook", done: false }]} />
      </div>
    </Card>
  );
}

function ShoppingCard() {
  return (
    <Card label="Shopping">
      <TodoList title="Items" storageKey="shopping" seed={[{ id: "sh1", text: "Oat milk", done: false }]} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Budget (manual — this month)                                       */
/* ------------------------------------------------------------------ */
function BudgetCard({ secsLeft, onLock }) {
  const [lines, setLines] = usePersisted("budget_month", [
    { id: "b1", label: "Salary", amount: 3200, type: "income" },
    { id: "b2", label: "Rent", amount: 1150, type: "expense" },
    { id: "b3", label: "Groceries", amount: 400, type: "expense" },
    { id: "b4", label: "Transport", amount: 90, type: "expense" },
  ]);
  const [draft, setDraft] = useState({ label: "", amount: "", type: "expense" });

  const income = lines.filter((l) => l.type === "income").reduce((s, l) => s + l.amount, 0);
  const expense = lines.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
  const remaining = income - expense;

  const add = () => {
    const amt = Number(draft.amount);
    if (!draft.label.trim() || !amt) return;
    setLines((xs) => [...xs, { id: uid(), label: draft.label.trim(), amount: amt, type: draft.type }]);
    setDraft({ label: "", amount: "", type: "expense" });
  };
  const remove = (id) => setLines((xs) => xs.filter((x) => x.id !== id));
  const fmt = (n) => "€" + n.toLocaleString("de-DE");

  return (
    <Card label="Budget · This month" right={<span className="inline-flex items-center gap-3"><span className={remaining >= 0 ? "text-gray-900" : "text-gray-900 font-bold"}>{fmt(remaining)} left</span><LockChip secs={secsLeft} onLock={onLock} /></span>}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="border border-gray-200 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400">In</div>
          <div className="font-mono text-lg">{fmt(income)}</div>
        </div>
        <div className="border border-gray-200 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Out</div>
          <div className="font-mono text-lg">{fmt(expense)}</div>
        </div>
      </div>

      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.id} className="group flex items-center justify-between border-b border-gray-100 py-1.5">
            <span className="flex items-center gap-2 text-sm text-gray-800">
              <span className={`h-2 w-2 shrink-0 ${l.type === "income" ? "bg-gray-900" : "border border-gray-400"}`} />
              {l.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-700">{l.type === "expense" ? "−" : "+"}{fmt(l.amount)}</span>
              <button onClick={() => remove(l.id)} className="opacity-0 group-hover:opacity-100">
                <Trash2 size={13} className="text-gray-400 hover:text-gray-900" />
              </button>
            </span>
          </li>
        ))}
      </ul>

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
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="€"
          className="w-20 border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          onClick={() => setDraft((d) => ({ ...d, type: d.type === "expense" ? "income" : "expense" }))}
          className="w-24 shrink-0 border border-gray-300 px-2 font-mono text-xs text-gray-600 hover:border-gray-900"
          title="Toggle income / expense"
        >
          {draft.type}
        </button>
        <button onClick={add} className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white">
          <Plus size={16} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Health documents                                                   */
/* ------------------------------------------------------------------ */
const HEALTH_DOCS = [
  { id: "h1", name: "Blood panel", date: "Mar 2026", tags: ["labs", "gp"], note: "Full metabolic panel — all values within range except vitamin D (low)." },
  { id: "h2", name: "MRI — right knee", date: "Nov 2025", tags: ["imaging", "ortho"], note: "Minor meniscal wear noted. Follow-up recommended in 12 months." },
  { id: "h3", name: "Vaccination record", date: "current", tags: ["records"], note: "Tetanus booster due 2027." },
];

function HealthCard({ secsLeft, onLock }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [emailedId, setEmailedId] = useState(null);

  const filtered = HEALTH_DOCS.filter(
    (d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.tags.some((t) => t.includes(q.toLowerCase()))
  );

  return (
    <Card label="Health records" right={<span className="inline-flex items-center gap-2"><Sample /><LockChip secs={secsLeft} onLock={onLock} /></span>}>
      <div className="mb-3 flex items-center gap-2 border border-gray-300 px-2">
        <Search size={14} className="text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or tag…"
          className="w-full py-1.5 text-sm focus:outline-none"
        />
      </div>
      <ul className="space-y-2">
        {filtered.map((d) => (
          <li key={d.id} className="border border-gray-200">
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="text-sm text-gray-900">{d.name}</div>
                <div className="mt-0.5 flex gap-1">
                  {d.tags.map((t) => (
                    <span key={t} className="font-mono text-[10px] uppercase tracking-wider text-gray-500">#{t}</span>
                  ))}
                  <span className="font-mono text-[10px] text-gray-400">· {d.date}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setOpenId(openId === d.id ? null : d.id)}
                  className="border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                >
                  Info
                </button>
                <button
                  onClick={() => setEmailedId(d.id)}
                  className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-900"
                >
                  <Mail size={12} /> Email
                </button>
              </div>
            </div>
            {openId === d.id && <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">{d.note}</div>}
            {emailedId === d.id && (
              <div className="flex items-start gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                In the live app this emails the file to you — each send asks you to confirm first.
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && <li className="py-2 text-xs text-gray-400">No documents match.</li>}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick links                                                        */
/* ------------------------------------------------------------------ */
function LinksCard() {
  const [links, setLinks] = usePersisted("quick_links_v2", [
    { id: "l1", label: "Bank", url: "https://example.com" },
    { id: "l2", label: "Health insurance", url: "https://example.com" },
    { id: "l3", label: "Investments", url: "https://example.com" },
    { id: "l4", label: "Calendar", url: "https://example.com" },
  ]);
  const [draft, setDraft] = useState({ label: "", url: "" });

  const add = () => {
    if (!draft.label.trim() || !draft.url.trim()) return;
    let url = draft.url.trim();
    if (!/^https?:\/\//.test(url)) url = "https://" + url;
    setLinks((xs) => [...xs, { id: uid(), label: draft.label.trim(), url }]);
    setDraft({ label: "", url: "" });
  };
  const remove = (id) => setLinks((xs) => xs.filter((x) => x.id !== id));

  return (
    <Card label="Quick links">
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
            <button onClick={() => remove(l.id)} className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center border border-gray-300 bg-white group-hover:flex">
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
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
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="example.com"
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button onClick={add} className="shrink-0 border border-gray-900 px-2 text-gray-900 hover:bg-gray-900 hover:text-white">
          <Plus size={16} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */
export default function PersonalHub() {
  const now = new Date();
  const hr = now.getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const [unlocks, setUnlocks] = useState({ budget: 0, health: 0 }); // expiry timestamps; 0 = locked
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const isOpen = (key) => unlocks[key] > nowTick;
  const secsLeft = (key) => Math.max(0, Math.ceil((unlocks[key] - nowTick) / 1000));
  const tryUnlock = useCallback((key, code) => {
    if (code === CODES[key]) { setUnlocks((u) => ({ ...u, [key]: Date.now() + LOCK_MS })); return true; }
    return false;
  }, []);
  const lockKey = (key) => setUnlocks((u) => ({ ...u, [key]: 0 }));
  const lockAll = () => setUnlocks({ budget: 0, health: 0 });
  const protectedCount = ["budget", "health"].filter((k) => !isOpen(k)).length;
  const anyOpen = protectedCount < 2;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between border-b border-gray-900 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-gray-400">Personal</div>
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
                <button onClick={lockAll} className="inline-flex items-center gap-1 border border-gray-300 px-2 py-0.5 font-mono text-[11px] text-gray-600 hover:border-gray-900">
                  <Lock size={11} /> Lock all
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <WeatherCard />
            <CalendarCard />
          </div>
          <div className="lg:col-span-2"><MacrosCard /></div>
          <div className="space-y-4 lg:col-span-1">
            <TodoCard />
            <ShoppingCard />
          </div>
          <div className="lg:col-span-1">
            {isOpen("budget")
              ? <BudgetCard secsLeft={secsLeft("budget")} onLock={() => lockKey("budget")} />
              : <LockedCard label="Budget · This month" hint={CODES.budget} onUnlock={(c) => tryUnlock("budget", c)} />}
          </div>
          <div className="lg:col-span-1">
            {isOpen("health")
              ? <HealthCard secsLeft={secsLeft("health")} onLock={() => lockKey("health")} />
              : <LockedCard label="Health records" hint={CODES.health} onUnlock={(c) => tryUnlock("health", c)} />}
          </div>
          <div className="lg:col-span-3"><LinksCard /></div>
        </div>

        <footer className="mt-8 border-t border-gray-200 pt-4 font-mono text-[11px] text-gray-400">
          Shell prototype · to-do, budget & links persist · weather, calendar & health are sampled
        </footer>
      </div>
    </div>
  );
}
