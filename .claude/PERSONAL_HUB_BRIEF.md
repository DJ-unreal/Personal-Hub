# Personal Hub — Build Brief

A self-hosted, single-user personal dashboard: one place for the info and links used
day to day. This document is the spec. `PersonalHub.jsx` (the prototype in this folder)
is the visual and interaction reference — match its look and behaviour, then replace its
mock/sampled parts with real implementations.

---

## Stack

- **Next.js (App Router) + React** — one codebase for UI and the small backend (API
  routes handle weather, calendar OAuth, food lookups, email).
- **SQLite** — single-file store for the everyday modules. Single-user, zero-ops.
- **Health documents** — files stored on a mounted disk volume the user owns; only
  tags/metadata live in SQLite. The files never leave the user's own hardware.
- **Docker Compose** — for self-hosting on the user's box or VPS.
- **Auth** — one master login (password hashed with argon2); per-module passcodes for the
  protected tier; protected-tier data encrypted at rest.

---

## Design language

Carry these over from the prototype exactly:

- Monochrome: white background, near-black text, greys for structure. No accent colours.
- **Monospace** for data, figures, and eyebrow/labels; **sans** for prose and headings.
- Hairline rules, sharp corners, generous spacing — an "instrument panel" feel.
- Alerts and warnings render as **inverted black pills**, not coloured — this keeps the
  palette strictly black/white/grey while still reading as an alert.

---

## Modules

| Module | Data source | Notes |
|---|---|---|
| **Weather** | Open-Meteo (keyless) | Daily overview + warnings: snow, hail, rain, temp extremes. |
| **Calendar (Today)** | Google Calendar (OAuth) | Times + event names only. Each event deep-links to the event in Google Calendar. Needs the user's own OAuth client credentials. |
| **Macros** | Food DB (e.g. Open Food Facts) + vision model | Portion-based calculation; barcode/photo food identification. Summary tile on the dashboard, fuller tracker behind it. |
| **To-do** | SQLite | Separate Personal and Work lists; add / check / delete. |
| **Shopping** | SQLite | Same format as the to-do lists. |
| **Budget** *(protected)* | Manual entry | Income/expenses + monthly costs, running "remaining". **Not** bank-linked — the user keeps their own banking app. Gated + encrypted. |
| **Health records** *(protected)* | Files on owned disk + tags in SQLite | Search by name/tag. Retrieve as a text answer **or** email a copy of the document. Gated + encrypted. |
| **Quick links** | SQLite | Editable labelled links (Bank, Health insurance, Investments, Calendar, …). |

---

## Security model

- Master login (argon2-hashed password).
- Per-module passcodes for **Budget** and **Health** — independent of each other.
- Auto-relock timer per protected module (resets on activity, unlike the prototype's fixed
  countdown).
- Encryption at rest for protected-tier data.
- Health document files stay on the user's own hardware.

---

## Integrations & boundaries

- **Open-Meteo** — no API key, works immediately.
- **Google Calendar** — OAuth with the user's own credentials and a callback URL; this is
  the main reason the app runs locally.
- **Email (health-doc send)** — every send pauses for explicit confirmation first. Nothing
  is emailed silently.
- **Investments / trading** — portfolio and market-data views are fine to build. Actual
  order execution stays user-authorised, never autonomous.

---

## Secrets (`.env`, never committed)

Placeholders to expect:

- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- `SESSION_SECRET`
- `MASTER_PASSWORD_HASH`
- `ENCRYPTION_KEY` (protected-tier at-rest encryption)
- Email/SMTP or Gmail credentials (added when the health-doc email feature lands)
- Any food-DB / vision keys, if a keyed provider is chosen

---

## Suggested build order

1. Scaffold Next.js + Tailwind; port the shell layout and design tokens from `PersonalHub.jsx`.
2. Stand up the SQLite data layer and API routes.
3. Port the simple modules (to-do, shopping, budget UI, quick links) to persist via SQLite.
4. Wire live weather through a server route to Open-Meteo.
5. Auth: master login + per-module passcodes + auto-relock + at-rest encryption for the
   protected tier.
6. Google Calendar OAuth + the Today agenda with per-event deep-links.
7. Health records: upload/store on disk, tagging, search, text retrieval; then
   email-a-copy (with the confirmation step).
8. Macros: food-DB lookup + photo identification.
9. Later: Investments views; package with Docker Compose for deploy.

---

## Reference

`PersonalHub.jsx` — the working prototype. Use it for the exact look and interactions. Its
passcode gate is a **mock** for demonstration; replace it with the real auth described above.
