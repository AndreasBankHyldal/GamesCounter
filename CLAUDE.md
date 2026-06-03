@AGENTS.md

# Project orientation

A card-game companion. Two things live here:

1. A single-device **scorekeeper** (500, Piratbridge, Gabong) — the original app.
2. **Online multiplayer** built on [boardgame.io](https://boardgame.io), currently the game **500**.

## Monorepo (npm workspaces)

```
apps/web        Next.js 16 app — scorekeeper + multiplayer lobby/table. Deploys to Vercel.
apps/server     boardgame.io game server + lobby API + Postgres + cleanup + keep-alive. Deploys to Render.
packages/games  @gamescounter/games — shared, framework-agnostic engine (the 500 rules). Used by both web + server.
```

## The 500 engine — `packages/games/src/five-hundred/`

- `game.ts` — the boardgame.io `Game`: `setup`, `moves`, `turn` (onBegin/onEnd), `endIf`, `playerView`.
- `melds.ts` — run validation. **House rule: the Ace is unbounded** (K-A-2 is a valid run) → ranks are a 13-position *circle* (`circularStart`/`meldingOpen` style).
- `scoring.ts`, `types.ts` (`FiveHundredState`), `cards.ts` (52 + N jokers, point values).
- Key state: `hands`/`stock` are secret (redacted in `playerView`); `melds`, cumulative `scores`, `roundNumber`, `turnsThisRound`, `mustMeld`/`meldedThisTurn`, `winningScore`, `jokers`.
- **Match options** come via boardgame.io `setupData` (`FiveHundredSetupData`): `jokers` (0–4), `winningScore` (100–1000). Set in `lobby.createRoom`, read in `setup`.
- Rules that bit us before (don't regress): melding/take-pile only open **after everyone's first turn** (`turnsThisRound > numPlayers`); take-pile **−50** is applied in **`turn.onEnd`** so it fires however the turn ends; swapping a joker leaves the slot's points with the **original placer**; host (seat 0) starts the next round and the first player rotates each round.

## Multiplayer architecture

- **Lobby**: private/unlisted matches addressed by a 6-char code (server overrides boardgame.io's `uuid`). Names + avatars passed at join, stored in match metadata.
- **Web client**: `apps/web/src/lib/multiplayer/` (`client.tsx`, `lobby.ts`, `identity.ts`, `sound.ts`). The table UI is `apps/web/src/components/multiplayer/FiveHundredBoard.tsx` (the big one). Lobby routes under `apps/web/src/app/play/`.
- **Hidden state** via `playerView`; reconnect via `{playerID, credentials}` in localStorage per room.
- **Persistence**: `apps/server/src/db.ts` is a custom `pg` adapter; matches survive restarts when `DATABASE_URL` is set (else in-memory).

## Dev

```bash
npm install --legacy-peer-deps   # boardgame.io lists React <=18 as a peer; we're on React 19
npm run dev                       # web :3000 + server :8000
npm run typecheck:games           # engine in isolation
npm run lint && npm run build:web
```

## Deploy

- **Vercel** (web): Root Directory = `apps/web`; env `NEXT_PUBLIC_SERVER_URL` = the Render URL.
- **Render** (server): Root Directory = _blank_ (repo root, for workspace resolution); Build `npm install --legacy-peer-deps`; Start `npm run start:server`; env `DATABASE_URL` (Postgres) + optional `CLIENT_ORIGIN`. See `render.yaml`.

## Gotchas / conventions

- The **server is CommonJS** (no `"type":"module"`) because boardgame.io's subpath exports don't resolve under Node ESM. The `games` package is CJS for the same reason.
- Run TS directly with `tsx` (a runtime dep) — no build step on the server.
- The engine has **no Math.random** in moves; use boardgame.io's `random` plugin (server-authoritative). Verify engine changes with a headless `boardgame.io/client` flow test (see git history for examples).
- Always `tsc` + `eslint` + `next build` before committing. Each change → its own branch off `main` → PR; end commit messages with the `Co-Authored-By` trailer.
