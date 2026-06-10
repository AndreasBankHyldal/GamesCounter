import { Server, Origins } from "boardgame.io/server";
import { FiveHundred, Piratbridge } from "@gamescounter/games";
import { makeRoomCode } from "./codes";
import { startCleanup } from "./cleanup";
import { startKeepAlive } from "./keepalive";
import { PostgresStore } from "./db";

const PORT = Number(process.env.PORT ?? 8000);

// Allowed browser origins for the game + lobby API. Localhost is always allowed
// for development; the deployed web origin comes from CLIENT_ORIGIN. Vercel
// preview URLs (*.vercel.app) are allowed via regex so previews work too.
const origins: (string | RegExp)[] = [Origins.LOCALHOST, /\.vercel\.app$/];
if (process.env.CLIENT_ORIGIN) origins.push(process.env.CLIENT_ORIGIN);

// Persist matches in Postgres when DATABASE_URL is set so games survive a
// server restart / spin-down; otherwise fall back to boardgame.io's in-memory
// store (fine for local dev).
const db = process.env.DATABASE_URL
  ? new PostgresStore(process.env.DATABASE_URL)
  : undefined;

const server = Server({
  games: [FiveHundred, Piratbridge],
  origins,
  db,
  // Matches are private (unlisted) and addressed by a short shareable code.
  // Overriding `uuid` makes the lobby's create endpoint mint these codes.
  uuid: () => makeRoomCode(),
});

// Auto-delete matches once everyone has been gone for 15+ minutes.
startCleanup(server.db);

// Keep the Render free instance awake during play (no-op off Render).
startKeepAlive();

server.run(PORT, () => {
  console.log(`boardgame.io server listening on :${PORT}`);
  console.log(`Games: ${[FiveHundred.name, Piratbridge.name].join(", ")}`);
  console.log(`Storage: ${db ? "Postgres (persistent)" : "in-memory"}`);
});
