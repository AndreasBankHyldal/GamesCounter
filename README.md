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
```

## Getting started

```bash
# boardgame.io 0.50 lists React <=18 as a peer; this app is on React 19.
npm install --legacy-peer-deps

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
| server     | `CLIENT_ORIGIN`          | Extra allowed browser origin (the deployed web URL)  |

`*.vercel.app` and `localhost` origins are allowed automatically.

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
- **Build Command**: `npm install --legacy-peer-deps`
- **Start Command**: `npm run start:server`
- **Env vars**:
  - `CLIENT_ORIGIN` = your Vercel URL (Render injects `PORT` and
    `RENDER_EXTERNAL_URL` itself).
  - `DATABASE_URL` = a Postgres connection string (see below).
  - `ADMIN_SECRET` = a high-entropy secret used for operational controls.
    Generate one with `openssl rand -hex 32`.

The server runs TypeScript directly via `tsx` (a runtime dependency — no build
step). Copy the resulting URL, e.g. `https://gamescounter-server.onrender.com`.

#### Persistence (recommended)

Without `DATABASE_URL` the server uses **in-memory** storage, so matches vanish
on every restart/spin-down. To keep games alive:

1. Render → **New → Postgres** (free plan), same region as the service.
2. On the web service, add env var `DATABASE_URL` → link it to that database's
   **Internal Connection String** (or use the blueprint, which wires this up).
3. Redeploy. Logs should show `Storage: Postgres (persistent)`. The
   `bgio_matches` table is created automatically on first boot.

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

### Free-tier caveats

- Keep-alive protects active games from Render's idle spin-down. Once it stops,
  the next connection may have a normal Render cold-start delay.
- Render's **free Postgres** has storage/age limits; upgrade if you need it
  long-term.
