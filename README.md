# Games Counter

A card-game companion: a single-device **scorekeeper** (500, Piratbridge, Gabong)
plus **online multiplayer** built on [boardgame.io](https://boardgame.io), starting
with the game **500**.

## Monorepo layout

npm workspaces:

```
apps/web        Next.js app — scorekeeper + multiplayer lobby/table (deploys to Vercel)
apps/server     boardgame.io game server + lobby API + idle cleanup (deploys to Render)
packages/games  @gamescounter/games — shared, framework-agnostic game engine (the 500 rules)
packages/boardgame.io  Private, MIT-licensed security fork of boardgame.io 0.50.2
```

## Getting started

```bash
# Deterministic workspace install; do not execute dependency lifecycle scripts.
npm ci --ignore-scripts --legacy-peer-deps

# Run web (:3000) and game server (:8000) together
npm run dev

# …or individually
npm run dev:web
npm run dev:server
```

Open <http://localhost:3000>, choose **Play 500 online**, create a room, share the
6-character code, and have friends join.

### Useful scripts

```bash
npm run typecheck:games   # type-check the shared engine in isolation
npm run lint              # lint the web app
npm run build:web         # production build of the web app
```

## Environment variables

| App        | Variable                 | Purpose                                              |
| ---------- | ------------------------ | ---------------------------------------------------- |
| web        | `NEXT_PUBLIC_SERVER_URL` | Base URL of the game server (default `http://localhost:8000`) |
| server     | `PORT`                   | Port to listen on (Render sets this; default `8000`) |
| server     | `CLIENT_ORIGIN`          | Comma-separated exact browser origins; required in production; HTTPS only there |
| server     | `DATABASE_URL`           | Postgres URL; non-loopback hosts require verified TLS |
| server     | `NODE_EXTRA_CA_CERTS`     | Optional CA file trusted by Node for a private database CA |

Development defaults to `http://localhost:3000` and `http://127.0.0.1:3000`
when `CLIENT_ORIGIN` is unset. Production (`NODE_ENV=production` or Render) must
configure `CLIENT_ORIGIN`. Add each trusted Vercel preview origin explicitly;
there is no `*.vercel.app` wildcard. For example:

```text
CLIENT_ORIGIN=https://your-project.vercel.app,https://your-trusted-preview.vercel.app
```

For LAN development or a different dev-server port, explicitly include that
browser origin in `CLIENT_ORIGIN` too.

HTTP requests with an unlisted Origin are rejected. Originless HTTP requests
remain available for the authenticated admin CLI and keep-alive. Socket.IO
polling and WebSocket handshakes require a listed Origin; native/CLI game clients
without one are intentionally rejected. Origins are not authentication:
per-player credentials are still required, and a non-browser can forge Origin.

The [local boardgame.io fork](packages/boardgame.io/README.md) removes the unused
Svelte debugger and ships reviewed source plus checked-in CJS/ESM runtimes.
It does not change the game state format. Root overrides patch the network and
tooling dependency trees; do not replace the local version with an upstream
registry package or force a new Svelte major into the old debugger.

## How the multiplayer works

- **Lobby** — matches are private/unlisted and addressed by a short shareable code
  (the server overrides boardgame.io's match-ID generator to mint 6-char codes).
  Player names are passed at join time and stored in match metadata.
- **Host start** — the host (seat 0) records a `started` flag in their player data;
  every client polls the room and advances to the table together.
- **Hidden state** — `playerView` redacts other players' hands and the face-down
  stock; only counts are exposed to clients.
- **Reconnect** — each player's `{ playerID, credentials }` is kept in
  `localStorage` per room, so a disconnected player rejoins the same seat.
  New player credentials are 256-bit cryptographic tokens, separate from short
  room codes. Existing persisted credentials are not silently invalidated:
  finish existing games before rolling out the credential hardening if they
  were created by the older six-character generator.
- **Idle cleanup** — a 60s sweep deletes matches once every player has been
  disconnected for 15+ minutes (`apps/server/src/cleanup.ts`).

## The game: 500

Rules (deal, draw/take-pile, melds, joker/ace declarations, first-round
restrictions, close-and-score, first to 500 wins) live entirely in
[`packages/games/src/five-hundred`](packages/games/src/five-hundred). The Next.js
table UI is [`apps/web/src/components/multiplayer/FiveHundredBoard.tsx`](apps/web/src/components/multiplayer/FiveHundredBoard.tsx).

## Deployment

Deploy the **server to Render** first, then the **web app to Vercel** pointed at it.

### Server → Render

A [`render.yaml`](render.yaml) blueprint is included. Either use it (New →
Blueprint) or create a **Web Service** manually with:

- **Root Directory**: _blank_ (the repo root — required so npm workspaces can
  resolve `@gamescounter/games`; do **not** set it to `apps/server`).
- **Build Command**: `npm ci --ignore-scripts --legacy-peer-deps`
- **Start Command**: `npm run start:server`
- **Env vars**:
  - `CLIENT_ORIGIN` = your exact HTTPS Vercel URL and any explicitly trusted
    preview URLs, comma-separated (Render injects `PORT` and
    `RENDER_EXTERNAL_URL` itself).
  - `DATABASE_URL` = a Postgres connection string (see below).
  - `ADMIN_SECRET` = a high-entropy secret used for operational controls.
    Generate one with `openssl rand -hex 32`.

The server runs TypeScript directly via `tsx` (a runtime dependency — no build
step). Copy the resulting URL, e.g. `https://gamescounter-server.onrender.com`.

#### Persistence (recommended)

Without `DATABASE_URL` the server uses **in-memory** storage, so matches vanish
on every restart/spin-down. To keep games alive:

1. Provision Postgres, for example an external Neon database as described in
   `render.yaml`.
2. Set `DATABASE_URL` manually in Render. External connections use verified TLS;
   `sslmode=require` and `sslmode=verify-full` are normalized to full certificate
   and hostname verification. Insecure modes, host query overrides and
   certificate-file URI options are rejected. For a private CA, set
   `NODE_EXTRA_CA_CERTS` to its certificate file before starting Node.
3. Redeploy. Logs should show `Storage: Postgres (persistent)`. The
   `bgio_matches` table is created automatically on first boot.

Only exact `localhost`, `127.0.0.1` and `::1` database hosts default to plaintext
for local development. A password or database name containing `localhost` cannot
disable TLS. Invalid database URL/security options fail startup without printing
the connection string; an unreachable database retains the existing, explicitly
logged in-memory fallback.

The server **self-pings** `RENDER_EXTERNAL_URL` every 10 min while a multiplayer
game is active. It stops pinging when no unfinished matches remain, allowing the
free instance to sleep, and starts again when a room is created or a player
reconnects. Match data remains in Postgres while Render sleeps.

#### Keep-alive controls

Create a local configuration file once:

```bash
cp scripts/render-admin.env.example .env.render-admin
```

Open `.env.render-admin` and replace `ADMIN_SECRET` with the same value configured
in Render. This local file is ignored by Git, so the secret will not be
committed.

This is an app-level `ADMIN_SECRET`, not a Render API key. External admin URLs
must use HTTPS; HTTP is permitted only on exact loopback hosts for development.

Inspect the keep-alive state and persisted rooms:

```bash
npm run render:status
```

Stop all self-pinging without deleting any rooms:

```bash
npm run render:sleep
```

The command may wake a sleeping Render instance long enough to respond, but it
does not restart keep-alive. A new room or player reconnection restarts it
automatically. Without `ADMIN_SECRET`, both admin routes are disabled.

### Web → Vercel

- Import the repo; set **Root Directory** to `apps/web`.
- Env var: `NEXT_PUBLIC_SERVER_URL` = the Render URL from above.
- `apps/web/vercel.json` overrides installation with
  `npm ci --ignore-scripts --legacy-peer-deps`; npm resolves the shared workspace
  lockfile. Keep monorepo/shared-package access enabled in the project settings.

### Free-tier caveats

- Keep-alive protects active games from Render's idle spin-down. Once it stops,
  the next connection may have a normal Render cold-start delay.
- Render's **free Postgres** has storage/age limits; upgrade if you need it
  long-term.

## Security checks

Dependency updates must refresh and review the shared lockfile without executing
install hooks:

```bash
npm update --package-lock-only --ignore-scripts --legacy-peer-deps
npm audit --package-lock-only --ignore-scripts
npm ci --ignore-scripts --legacy-peer-deps
```

Vercel uses Node 24. When changing dependency overrides, also validate a clean
`npm ci` from `apps/web` with the Node 24/npm toolchain before pushing. The
dependency regression tests check that the local fork and the shared nanoid 3
override resolve to the same locked version.

Run the focused security and multiplayer regressions without starting the app:

```bash
node --import tsx --test apps/server/src/*.test.ts
node --test packages/boardgame.io/fork.test.mjs scripts/admin-url.test.mjs scripts/dependency-security.test.mjs
```

The native sharp runtime is checked using a generated one-pixel image. Do not
enable all lifecycle scripts to repair a native dependency; review any genuinely
necessary platform-specific step separately.
