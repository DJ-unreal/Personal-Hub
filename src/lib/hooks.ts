"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  BudgetLine,
  CalendarEvent,
  CalendarStatus,
  FoodItem,
  HealthDoc,
  ListItem,
  ListName,
  MacroSource,
  MacroSummary,
  PastEntry,
  PendingEmail,
  ProtectedModule,
  Recipe,
  RecipeItem,
  SessionState,
  Weather,
} from "@/lib/types";

/* ---------------------------------------------------------------------
   Client hooks — each loads a resource from the SQLite-backed API on
   mount and exposes async mutators that reconcile local state with the
   server's response. Mutators catch failures into `error` rather than
   throwing into event handlers.

   Optimistic where it helps responsiveness (toggle, delete); create uses
   the server-returned row (it carries the generated id + timestamp).
   --------------------------------------------------------------------- */

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/* ---------------------------- auth / session -------------------------- */
/* Source of truth for the master login + protected-module locks. Server
   returns secsLeft at fetch time; we hold an absolute expiry per module and
   tick a 1s countdown locally, reconciling with the server every 20s. */
export function useSession() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState<Record<ProtectedModule, number>>({
    budget: 0,
    health: 0,
  });
  const [, setTick] = useState(0);

  const apply = useCallback((s: SessionState) => {
    setAuthed(s.authed);
    const now = Date.now();
    setExpiry({
      budget: s.modules.budget.open ? now + s.modules.budget.secsLeft * 1000 : 0,
      health: s.modules.health.open ? now + s.modules.health.secsLeft * 1000 : 0,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.auth.session());
    } catch {
      /* keep last known state on a transient failure */
    }
  }, [apply]);

  useEffect(() => {
    api.auth
      .session()
      .then(apply)
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, [apply]);

  // 1s countdown tick + 20s server reconcile.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const r = setInterval(() => refresh(), 20000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [refresh]);

  const now = Date.now();
  const secsLeft = (m: ProtectedModule) =>
    Math.max(0, Math.ceil((expiry[m] - now) / 1000));
  const open = (m: ProtectedModule) => secsLeft(m) > 0;

  const login = useCallback(
    async (password: string): Promise<string | null> => {
      try {
        apply(await api.auth.login(password));
        return null;
      } catch (e) {
        return errMessage(e);
      }
    },
    [apply],
  );
  const logout = useCallback(async () => {
    try {
      apply(await api.auth.logout());
    } catch {
      /* ignore */
    }
  }, [apply]);
  const unlock = useCallback(
    async (m: ProtectedModule, code: string): Promise<string | null> => {
      try {
        apply(await api.auth.unlock(m, code));
        return null;
      } catch (e) {
        return errMessage(e);
      }
    },
    [apply],
  );
  const lock = useCallback(
    async (m: ProtectedModule) => {
      try {
        apply(await api.auth.lock(m));
      } catch {
        /* ignore */
      }
    },
    [apply],
  );
  const lockAll = useCallback(async () => {
    try {
      apply(await api.auth.lockAll());
    } catch {
      /* ignore */
    }
  }, [apply]);
  const touch = useCallback(
    async (m: ProtectedModule) => {
      try {
        apply(await api.auth.touch(m));
      } catch {
        /* ignore */
      }
    },
    [apply],
  );

  return {
    authed,
    loading,
    open,
    secsLeft,
    login,
    logout,
    unlock,
    lock,
    lockAll,
    touch,
  };
}

export function useListItems(list: ListName) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.listItems
      .list(list)
      .then((rows) => alive && setItems(rows))
      .catch((e) => alive && setError(errMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [list]);

  const add = useCallback(
    async (text: string) => {
      setError(null);
      try {
        const created = await api.listItems.create(list, text);
        setItems((xs) => [...xs, created]);
      } catch (e) {
        setError(errMessage(e));
      }
    },
    [list],
  );

  const toggle = useCallback(async (id: string, done: boolean) => {
    setError(null);
    // optimistic
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done } : x)));
    try {
      const updated = await api.listItems.update(id, { done });
      setItems((xs) => xs.map((x) => (x.id === id ? updated : x)));
    } catch (e) {
      setError(errMessage(e));
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done: !done } : x)));
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    const prev = { current: [] as ListItem[] };
    setItems((xs) => {
      prev.current = xs;
      return xs.filter((x) => x.id !== id);
    });
    try {
      await api.listItems.remove(id);
    } catch (e) {
      setError(errMessage(e));
      setItems(prev.current); // rollback
    }
  }, []);

  return { items, loading, error, add, toggle, remove };
}

export function useBudget() {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.budget
      .list()
      .then((rows) => alive && setLines(rows))
      .catch((e) => alive && setError(errMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const add = useCallback(
    async (label: string, amount: number, type: BudgetLine["type"]) => {
      setError(null);
      try {
        const created = await api.budget.create(label, amount, type);
        setLines((xs) => [...xs, created]);
        return true;
      } catch (e) {
        setError(errMessage(e));
        return false;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setError(null);
    const prev = { current: [] as BudgetLine[] };
    setLines((xs) => {
      prev.current = xs;
      return xs.filter((x) => x.id !== id);
    });
    try {
      await api.budget.remove(id);
    } catch (e) {
      setError(errMessage(e));
      setLines(prev.current);
    }
  }, []);

  return { lines, loading, error, add, remove };
}

export function useLinks() {
  const [links, setLinks] = useState<import("@/lib/types").QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.links
      .list()
      .then((rows) => alive && setLinks(rows))
      .catch((e) => alive && setError(errMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const add = useCallback(async (label: string, url: string) => {
    setError(null);
    try {
      const created = await api.links.create(label, url);
      setLinks((xs) => [...xs, created]);
      return true;
    } catch (e) {
      setError(errMessage(e));
      return false;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    const prev = { current: [] as import("@/lib/types").QuickLink[] };
    setLinks((xs) => {
      prev.current = xs;
      return xs.filter((x) => x.id !== id);
    });
    try {
      await api.links.remove(id);
    } catch (e) {
      setError(errMessage(e));
      setLinks(prev.current);
    }
  }, []);

  return { links, loading, error, add, remove };
}

export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.weather
      .get()
      .then((w) => alive && setWeather(w))
      .catch((e) => alive && setError(errMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { weather, loading, error };
}

/* Health documents — read live from the user's own disk folder. Only
   mounted once the health module is unlocked, so the fetch always runs
   against an open session. */
export function useHealthDocs() {
  const [docs, setDocs] = useState<HealthDoc[]>([]);
  const [configured, setConfigured] = useState(true);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.healthDocs.list();
      setConfigured(r.configured);
      setMailConfigured(r.mailConfigured);
      setDocs(r.docs);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Email is deliberately two-step: `prepare` returns what WOULD be sent
     so the user can check it, and only `confirm` actually delivers. */
  const [pending, setPending] = useState<PendingEmail | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);

  const prepareEmail = useCallback(async (id: string, to: string) => {
    setMailError(null);
    setSent(null);
    try {
      setPending(await api.healthDocs.prepareEmail(id, to));
    } catch (e) {
      setMailError(errMessage(e));
    }
  }, []);

  const confirmSend = useCallback(async () => {
    if (!pending) return;
    setSending(true);
    setMailError(null);
    try {
      const r = await api.healthDocs.confirmSend(pending.token);
      setSent(`Sent to ${r.to}`);
      setPending(null);
    } catch (e) {
      setMailError(errMessage(e));
      setPending(null); // token is single-use — force a fresh prepare
    } finally {
      setSending(false);
    }
  }, [pending]);

  const cancelEmail = useCallback(() => {
    setPending(null);
    setMailError(null);
    setSent(null);
  }, []);

  return {
    docs,
    configured,
    mailConfigured,
    loading,
    error,
    reload: load,
    pending,
    sending,
    sent,
    mailError,
    prepareEmail,
    confirmSend,
    cancelEmail,
  };
}

export function useCalendar() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.calendar.status();
      setStatus(s);
      setEvents(s.connected ? await api.calendar.events() : []);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Surface the OAuth redirect outcome, then clean it from the URL.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const outcome = params.get("calendar");
      if (outcome) {
        if (outcome === "denied") setError("Google access was denied");
        else if (outcome === "error") setError("Couldn't connect Google Calendar");
        else if (outcome === "unconfigured") setError("Calendar is not configured");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    load();
  }, [load]);

  const connect = () => {
    window.location.href = api.calendar.connectUrl;
  };
  /** Omit `id` to disconnect every account. */
  const disconnect = useCallback(
    async (id?: string) => {
      try {
        await api.calendar.disconnect(id);
        await load();
      } catch (e) {
        setError(errMessage(e));
      }
    },
    [load],
  );

  return {
    status,
    accounts: status?.accounts ?? [],
    events,
    loading,
    error,
    connect,
    disconnect,
  };
}

export function useMacros() {
  const [summary, setSummary] = useState<MacroSummary | null>(null);
  const [past, setPast] = useState<PastEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Previously-logged foods, for one-tap re-logging. Refreshed whenever the
  // day's entries change so a newly logged food appears straight away.
  const loadPast = useCallback(async () => {
    try {
      setPast(await api.macros.past());
    } catch {
      /* non-fatal — the rest of the tracker still works */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([api.macros.today(), api.macros.past()])
      .then(([today, history]) => {
        if (!alive) return;
        setSummary(today);
        setPast(history);
      })
      .catch((e) => alive && setError(errMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const add = useCallback(
    async (m: {
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      label?: string;
      grams?: number | null;
      portion?: string | null;
      source?: MacroSource;
    }) => {
      setError(null);
      try {
        const next = await api.macros.add(m);
        setSummary(next);
        loadPast();
        return true;
      } catch (e) {
        setError(errMessage(e));
        return false;
      }
    },
    [loadPast],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await api.macros.remove(id);
        setSummary(await api.macros.today());
        loadPast();
      } catch (e) {
        setError(errMessage(e));
      }
    },
    [loadPast],
  );

  /** Re-log a past food exactly as it was last logged. */
  const logAgain = useCallback(
    (p: PastEntry) =>
      add({
        kcal: p.kcal,
        protein: p.protein,
        carbs: p.carbs,
        fat: p.fat,
        label: p.label,
        grams: p.grams,
        portion: p.portion,
        source: p.source ?? undefined,
      }),
    [add],
  );

  return { summary, past, loading, error, add, remove, logAgain };
}

/* Saved meals ("recipes"): a named set of ingredients, plus the in-progress
   builder used to assemble one. The builder lives in component state only —
   nothing is persisted until you save. */
export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [building, setBuilding] = useState<RecipeItem[]>([]);
  // Set while editing an existing meal; null means building a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRecipes(await api.recipes.list());
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addIngredient = useCallback(
    (item: RecipeItem) => setBuilding((xs) => [...xs, item]),
    [],
  );
  const removeIngredient = useCallback(
    (index: number) => setBuilding((xs) => xs.filter((_, i) => i !== index)),
    [],
  );

  /* Replace one ingredient — used when its amount is adjusted in place. */
  const replaceIngredient = useCallback(
    (index: number, item: RecipeItem) =>
      setBuilding((xs) => xs.map((x, i) => (i === index ? item : x))),
    [],
  );

  const clearBuilder = useCallback(() => {
    setBuilding([]);
    setEditingId(null);
  }, []);

  /** Load an existing meal into the builder for editing. */
  const startEdit = useCallback((recipe: Recipe) => {
    setBuilding(recipe.items.map((i) => ({ ...i })));
    setEditingId(recipe.id);
    setError(null);
  }, []);

  /* Saves the builder — updating the meal being edited, or creating a new
     one when nothing is being edited. */
  const save = useCallback(
    async (name: string) => {
      setError(null);
      try {
        if (editingId) await api.recipes.update(editingId, name, building);
        else await api.recipes.create(name, building);
        setBuilding([]);
        setEditingId(null);
        await load();
        return true;
      } catch (e) {
        setError(errMessage(e));
        return false;
      }
    },
    [building, editingId, load],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await api.recipes.remove(id);
        await load();
      } catch (e) {
        setError(errMessage(e));
      }
    },
    [load],
  );

  /** Running totals for whatever is currently in the builder. */
  const builderTotals = building.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      protein: t.protein + i.protein,
      carbs: t.carbs + i.carbs,
      fat: t.fat + i.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    recipes,
    building,
    builderTotals,
    editingId,
    editingRecipe: recipes.find((r) => r.id === editingId) ?? null,
    error,
    addIngredient,
    removeIngredient,
    replaceIngredient,
    clearBuilder,
    startEdit,
    save,
    remove,
  };
}

/* Food lookup against Open Food Facts (proxied server-side). Handles both
   name search and barcode, and keeps them in one result list. */
export function useFoodSearch() {
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<FoodItem[]>, notFoundMsg: string) => {
      setSearching(true);
      setError(null);
      try {
        const r = await fn();
        setResults(r);
        setSearched(true);
        if (r.length === 0) setError(notFoundMsg);
      } catch (e) {
        setError(errMessage(e));
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const search = useCallback(
    (q: string) =>
      run(() => api.foods.search(q), "Nothing found — try a different term."),
    [run],
  );

  const byBarcode = useCallback(
    (code: string) =>
      run(
        () => api.foods.barcode(code),
        "That barcode isn't in Open Food Facts.",
      ),
    [run],
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setSearched(false);
  }, []);

  return { results, searching, error, searched, search, byBarcode, clear };
}
