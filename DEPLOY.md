# Deploying Personal Hub

Self-hosting with Docker Compose. Everything stays on hardware you control:
the SQLite database is a mounted volume and the health documents are mounted
read-only from your own disk.

> **Status:** the image and compose file are written but have **not been
> built or run** — Docker isn't installed on the development machine. The
> production build, the standalone server bundle and the app running under
> `NODE_ENV=production` were all verified directly; only the container layer
> is unproven. Expect to iterate on the first `docker compose up`.

---

## Requirements

- Docker with Compose v2 (`docker compose`, not `docker-compose`)
- A populated `.env.local` — see `.env.example`, or generate one with
  `npm run auth:set -- --master <pw> --budget <code> --health <code>`

## Quick start

```bash
docker compose up -d --build
```

Then open `http://localhost:3000`.

To point it at your real health documents and keep the database somewhere you
can back up, create a `.env` next to `docker-compose.yml`:

```bash
HEALTH_DOCS_HOST_DIR=C:/Users/jostd/OneDrive/Desktop/Claude/Health Files
HUB_DATA_HOST_DIR=C:/Users/jostd/AppData/Local/PersonalHub
HUB_PORT=3000
```

(Compose reads `.env` for variable substitution; `.env.local` is passed into
the container as its environment. They are different mechanisms — both are
used here.)

---

## Things that will trip you up

### 1. Serving over plain HTTP breaks login

In production the session cookie is marked `secure`, so browsers refuse to
send it over `http://` and you'll appear to be logged out immediately after
signing in. Either terminate TLS in front of the app (recommended), or
uncomment in `docker-compose.yml`:

```yaml
COOKIE_SECURE: "false"
```

Only do that on a network you trust — without TLS the session cookie travels
in clear text.

### 2. Google Calendar needs its redirect URI updated

The OAuth callback must match *exactly*, in two places:

1. `GOOGLE_OAUTH_REDIRECT_URI` in the compose `environment:` block
2. The OAuth client's **Authorised redirect URIs** in Google Cloud Console

Both must be e.g. `https://hub.example.com/api/calendar/callback`. A mismatch
produces `redirect_uri_mismatch`.

### 3. Never build the image from a host-built `node_modules`

`@node-rs/argon2` and `sharp` ship platform-specific binaries. A build made on
Windows or macOS contains `*-win32-x64` / `*-darwin-*` binaries that cannot
load on Linux, and the failure surfaces as a broken login rather than an
obvious build error. `.dockerignore` excludes `node_modules` and `.next` so
the image always builds its own — leave it that way.

### 4. Node 24+ is required

The data layer uses the built-in `node:sqlite`. The image pins `node:24-slim`;
don't downgrade the base image.

### 5. Back up the database *with* the encryption key

`hub.db` is useless without the exact `ENCRYPTION_KEY` that wrote it — the
budget rows and stored Google tokens are AES-256-GCM encrypted. Back up both,
and never rotate `ENCRYPTION_KEY` while data exists.

Take the backup with the container stopped, or checkpoint first, so the
write-ahead log is folded in:

```bash
docker compose stop hub
docker run --rm -v personal-hub_hub-data:/data -v "$PWD:/backup" node:24-slim \
  node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/hub.db');d.exec('PRAGMA wal_checkpoint(TRUNCATE)');d.close();require('fs').copyFileSync('/data/hub.db','/backup/hub-backup.db')"
docker compose start hub
```

Copying a running database's `.db` alone can capture almost nothing — most
recent writes may still be sitting in the `-wal` sidecar.

---

## Reaching it from your phone

- **Same Wi-Fi:** `http://<host-lan-ip>:3000`. Note that the barcode scanner
  needs a secure context, so camera scanning will not work over plain HTTP.
- **From anywhere:** put it behind Tailscale or a reverse proxy with TLS
  (Caddy makes this a two-line config). Real HTTPS also re-enables the
  barcode scanner and lets you leave `COOKIE_SECURE` at its secure default.

Do not expose this directly to the internet without TLS — a single master
password guards medical documents and the ability to email them.
