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
- **Env var**: `CLIENT_ORIGIN` = your Vercel URL (Render injects `PORT` itself).

The server runs TypeScript directly via `tsx` (a runtime dependency — no build
step). Copy the resulting URL, e.g. `https://gamescounter-server.onrender.com`.

### Web → Vercel

- Import the repo; set **Root Directory** to `apps/web`.
- Env var: `NEXT_PUBLIC_SERVER_URL` = the Render URL from above.

### Free-tier caveats

- Render free services **spin down after ~15 min idle** and cold-start (~30–60s)
  on the next request — this drops active matches/websockets.
- Storage is **in-memory**, so matches are also lost on any restart. Swap in a
  persistent boardgame.io storage adapter (e.g. Postgres/Flatfile) for real use.
