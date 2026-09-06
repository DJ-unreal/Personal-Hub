import type {
  BudgetLine,
  BudgetType,
  CalendarEvent,
  CalendarStatus,
  FoodItem,
  HealthDocsResult,
  ListItem,
  ListName,
  MacroSource,
  MacroSummary,
  PastEntry,
  PendingEmail,
  ProtectedModule,
  QuickLink,
  Recipe,
  RecipeItem,
  SessionState,
  Weather,
} from "@/lib/types";

/* ---------------------------------------------------------------------
   Client-side API wrapper. Thin typed fetch calls to the step-2 route
   handlers. Throws Error(message) on non-2xx so hooks can surface it.
   --------------------------------------------------------------------- */

const JSON_HEADERS = { "Content-Type": "application/json" };

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  listItems: {
    list: (list: ListName) =>
      req<ListItem[]>(`/api/list-items?list=${encodeURIComponent(list)}`),
    create: (list: ListName, text: string) =>
      req<ListItem>("/api/list-items", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ list, text }),
      }),
    update: (id: string, patch: { done?: boolean; text?: string }) =>
      req<ListItem>(`/api/list-items/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/list-items/${id}`, { method: "DELETE" }),
  },

  budget: {
    list: () => req<BudgetLine[]>("/api/budget"),
    create: (label: string, amount: number, type: BudgetType) =>
      req<BudgetLine>("/api/budget", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ label, amount, type }),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/budget/${id}`, { method: "DELETE" }),
  },

  links: {
    list: () => req<QuickLink[]>("/api/links"),
    create: (label: string, url: string) =>
      req<QuickLink>("/api/links", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ label, url }),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/links/${id}`, { method: "DELETE" }),
  },

  macros: {
    today: () => req<MacroSummary>("/api/macros"),
    add: (m: {
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      label?: string;
      grams?: number | null;
      portion?: string | null;
      source?: MacroSource;
    }) =>
      req<MacroSummary>("/api/macros", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(m),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/macros/${id}`, { method: "DELETE" }),
    past: () => req<PastEntry[]>("/api/macros/past"),
  },

  recipes: {
    list: () => req<Recipe[]>("/api/recipes"),
    create: (name: string, items: RecipeItem[]) =>
      req<Recipe>("/api/recipes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, items }),
      }),
    update: (id: string, name: string, items: RecipeItem[]) =>
      req<Recipe>(`/api/recipes/${id}`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, items }),
      }),
    remove: (id: string) =>
      req<{ ok: true }>(`/api/recipes/${id}`, { method: "DELETE" }),
  },

  foods: {
    search: (q: string) =>
      req<FoodItem[]>(`/api/foods?q=${encodeURIComponent(q)}`),
    barcode: (code: string) =>
      req<FoodItem[]>(`/api/foods?barcode=${encodeURIComponent(code)}`),
  },

  weather: {
    get: () => req<Weather>("/api/weather"),
  },

  healthDocs: {
    list: () => req<HealthDocsResult>("/api/health-docs"),
    // Opened via a normal link/new tab (cookie-authenticated GET), not fetch.
    fileUrl: (id: string) => `/api/health-docs/${encodeURIComponent(id)}`,
    /* Two-step send. `prepare` never sends — it returns what WOULD be
       sent, for confirmation. Only `confirmSend` delivers. */
    prepareEmail: (id: string, to: string) =>
      req<PendingEmail>(`/api/health-docs/${encodeURIComponent(id)}/email`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ to }),
      }),
    confirmSend: (token: string) =>
      req<{ sent: true; to: string; filename: string }>(
        "/api/health-docs/email/confirm",
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ token }),
        },
      ),
  },

  calendar: {
    status: () => req<CalendarStatus>("/api/calendar/status"),
    events: () => req<CalendarEvent[]>("/api/calendar/events"),
    /** Disconnect one account, or every account when id is omitted. */
    disconnect: (id?: string) =>
      req<{ ok: true }>("/api/calendar/disconnect", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(id ? { id } : { all: true }),
      }),
    // connect is a top-level navigation (server redirects to Google), not fetch
    connectUrl: "/api/calendar/connect",
  },

  auth: {
    session: () => req<SessionState>("/api/auth/session"),
    login: (password: string) =>
      req<SessionState>("/api/auth/login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ password }),
      }),
    logout: () =>
      req<SessionState>("/api/auth/logout", { method: "POST" }),
    unlock: (module: ProtectedModule, passcode: string) =>
      req<SessionState>("/api/auth/unlock", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ module, passcode }),
      }),
    lock: (module: ProtectedModule) =>
      req<SessionState>("/api/auth/lock", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ module }),
      }),
    lockAll: () =>
      req<SessionState>("/api/auth/lock", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ all: true }),
      }),
    touch: (module: ProtectedModule) =>
      req<SessionState>("/api/auth/touch", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ module }),
      }),
  },
};
