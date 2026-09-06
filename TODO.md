# Personal Hub — outstanding items

Running list of everything parked for later. Nothing here blocks development;
the security section should be worked through **before the hub holds anything
you actually care about**.

Last updated: 2026-07-29 (after build step 7b).

---

## 1. Security — do these once the build is finished

### Rotate exposed secrets
These were pasted into a chat transcript and should be treated as compromised.

- [ ] **Google OAuth client secret** — exposed 2026-07-27.
      Google Cloud Console → APIs & Services → Credentials → your OAuth client →
      reset secret, then update `GOOGLE_OAUTH_CLIENT_SECRET` in `.env.local`.
      The existing calendar connection survives (the refresh token stays valid).
- [ ] **Gmail App Password** — exposed 2026-07-29 (`aozb …`).
      Google Account → Security → 2-Step Verification → App passwords → revoke,
      generate a fresh one, update `SMTP_PASS`.
- [ ] A third password was pasted on 2026-07-29 that looked like a **regular
      Google account password** (`wSGZ…`), not an app password. If that is your
      account password, change it. It was never written to any file.

### Replace the development credentials
- [x] **Done 2026-07-30.** Master password and both module passcodes replaced;
      the old `changeme` is confirmed rejected, all three hashes are valid
      argon2id, and `SESSION_SECRET` / `ENCRYPTION_KEY` were preserved (so
      existing encrypted budget data still decrypts).

To change them again:

```bash
node scripts/auth-set.mjs
```

Prompts for each value with typing hidden; press Enter to leave one
unchanged. **Use this rather than passing `--master` etc. on the command
line** — PowerShell mangles unquoted values containing `$`, `&`, spaces or
`!`, which silently stores a different password than you typed.

> Note: the prompt does not ask for confirmation, so a typo locks you out.
> Always verify you can log in immediately after changing it.

### Habit
- [ ] Prefer running `printf '…' >> .env.local` in your own terminal rather than
      pasting secrets into chat — anything pasted persists in the transcript.

---

## 2. Constraints & gotchas — things that will bite if forgotten

- **Never rotate `ENCRYPTION_KEY`.** Budget rows (and any future protected data)
  are AES-256-GCM encrypted with it; changing it makes existing rows permanently
  unreadable. `auth:set` preserves it unless `--rotate-keys` is passed.
- **`$` in env values is silently eaten.** Next's env loader performs variable
  expansion, and *quoting does not prevent it* — `'a$b'` still truncates.
  Escape as `a\$b`. This is why the argon2 hashes are stored base64-encoded and
  decoded in `src/lib/secrets.ts`.
- **Google Calendar reconnects roughly weekly.** The OAuth consent screen is in
  *Testing* mode, where Google expires refresh tokens after ~7 days. The card
  will show "Connect Google Calendar" again — not a bug. Avoiding it needs
  either Workspace (Internal mode) or Google verification review (the
  `calendar.readonly` scope is classed as sensitive).
- **Sessions are in-memory.** Restarting the server logs you out and relocks
  both protected modules. Intentional.
- **Never put `hub.db` in a cloud-synced folder.** It lived in OneDrive until
  2026-07-29 and now sits at `C:/Users/jostd/AppData/Local/PersonalHub`
  (`HUB_DATA_DIR`). Sync clients copy the `.db` independently of its `-wal`
  sidecar — when moved, the `.db` was 4 KB while the WAL held 370 KB, so a
  restored "backup" would have been essentially empty. They also cannot merge
  writes from two machines. The *project folder* in OneDrive is fine; only the
  live database was the risk.
- **Health documents are still in OneDrive** (`Health Files`). That's safe —
  they're static PDFs the app only reads, and the sync doubles as a backup.
- **Health documents are image-only scans.** No extractable text layer in any of
  them, so search is filename-based. See §4 if that ever needs to change.

---

## 3. Deviations from `PERSONAL_HUB_BRIEF.md`

Both were deliberate and requested — listed so they aren't "fixed" by mistake.

- **Dark theme.** The brief specifies "white background, near-black text";
  the app is dark by request (2026-07-29). Implemented by inverting the grey
  ramp in `src/app/globals.css`, so a *higher* grey number is a *lighter*
  colour. The brief text was not updated.
- **Health module scope.** The brief describes tags and "retrieve as a text
  answer"; scope was narrowed to list / open / email, since the documents are
  scans.

---

## 4. Deferred / optional enhancements

- [ ] Update `PERSONAL_HUB_BRIEF.md` so the spec matches the dark theme.
- [ ] Light/dark toggle — currently dark-only. Cheap to add: the palette is one
      block of variables, so it needs a `:root[data-theme="light"]` override
      plus a switch.
- [ ] Tags for health documents (the brief mentions them; search is name-only).
- [ ] OCR for health documents (e.g. tesseract.js, on-device) if full-text
      search or auto-summaries are ever wanted. Costs ~50–100 MB of wasm +
      language data and several seconds per page; accuracy on scanned German
      medical letterheads is variable.
- [ ] Confirm a health PDF opens inline in a real browser — the embedded
      preview pane has no PDF viewer, so this was only verified at the HTTP
      level (correct `application/pdf` + `inline`, byte-identical to disk).
- [ ] **Photo food identification** (deferred from step 8, 2026-07-29). Would
      send a photo to a vision model, which names the food and estimates the
      portion, then hits Open Food Facts for the macros. Needs an
      `ANTHROPIC_API_KEY` from console.anthropic.com — a fraction of a cent per
      photo. Portion estimates from a photo are inherently rough; barcode and
      name search stay the accurate paths.
- [ ] Test the barcode **camera scanner** on a real device. It uses the native
      `BarcodeDetector` API (Chrome/Edge; Firefox/Safari fall back to the
      manual field) and needs camera permission plus HTTPS or localhost. Only
      the fallback path could be verified here — the preview pane has no camera.
- [ ] **Set up a backup for `hub.db`.** It now sits outside OneDrive, so it is
      no longer copied anywhere automatically. Back it up together with
      `ENCRYPTION_KEY` — the database is unreadable without that exact key.
      Copy it while the server is stopped (or run
      `PRAGMA wal_checkpoint(TRUNCATE)` first) so the `-wal` contents are
      folded in; copying a running database's `.db` alone can capture almost
      nothing.
- [x] **Phone access — done 2026-07-30 via Tailscale.**
      From anywhere, with Tailscale connected on the phone:
      **`https://desktop-un9789t.tail0d0c09.ts.net`** (real certificate, so the
      barcode scanner works). Plain HTTP over the tailnet
      (`http://100.101.100.120:3000`) and the home LAN
      (`http://192.168.2.33:3000`) also work. Nothing is exposed to the public
      internet — the tailnet is only your own devices.
      - Set up with `tailscale serve --bg 3000`; undo with
        `tailscale serve --https=443 off`. Needed "HTTPS Certificates"
        enabling in the Tailscale admin console (DNS page) first.
      - All these origins are listed in `allowedDevOrigins` in
        `next.config.ts`; without that, Next serves the HTML but blocks the
        JavaScript and the page just looks dead.
      - **The PC must stay awake** — check Windows sleep settings.
- [ ] Editable macro targets. They live in the `settings` table
      (`macro_targets`) and are read by the app, but there's no UI to change
      them from the default 2200 kcal / 160 P / 220 C / 70 F.

---

## 5. Next session

- [ ] **Revisit the weather module** (requested 2026-07-30, no detail yet —
      ask what should change). Currently: current temp, feels-like, wind,
      today's high/low, and warning pills for rain / snow / hail / frost /
      heat, from Open-Meteo via `src/lib/weather.ts`, cached 15 minutes.
      Location is fixed to Regensburg via `WEATHER_LOCATION` /
      `WEATHER_LATITUDE` / `WEATHER_LONGITUDE`. Obvious directions if wanted:
      a multi-day forecast, hourly detail, or switching location from the UI.

## 6. Remaining build steps

- [ ] **Investments views** — deferred 2026-07-29; no active investments yet.
      Revisit in a few months.
- [ ] **Build and run the Docker image at least once.** `Dockerfile`,
      `docker-compose.yml` and `DEPLOY.md` are written but were never built —
      Docker isn't installed on the dev machine. The production build, the
      standalone bundle and the app under `NODE_ENV=production` were all
      verified directly, and the image builds without secrets present, but the
      container layer itself is unproven. Expect to iterate on first run.

(Step 8 is done apart from photo identification, which is listed in §4.)

### For deployment beyond localhost
See `DEPLOY.md` for the full guide. The short version:
- [ ] Set `GOOGLE_OAUTH_REDIRECT_URI` to the deployed origin **and** add that
      exact URI to the OAuth client's authorised redirect URIs.
- [ ] Serve over HTTPS. The session cookie is marked `secure` when
      `NODE_ENV=production`, so over plain HTTP login silently fails — set
      `COOKIE_SECURE=false` only on a network you trust.
- [ ] Back up the database alongside `ENCRYPTION_KEY` (see §2).
