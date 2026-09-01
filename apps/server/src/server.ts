import { Server, Origins } from "boardgame.io/server";
import { FiveHundred, Piratbridge, Pubgolf } from "@gamescounter/games";
import { makeRoomCode } from "./codes";
import { startCleanup } from "./cleanup";
import { configureAdminRoutes } from "./admin";
import { ActivitySocketIO } from "./activity-transport";
import { createKeepAlive } from "./keepalive";
import { PostgresStore } from "./db";

const PORT = Number(process.env.PORT ?? 8000);

// Last-resort guards: a single bad socket sync (e.g. a client connected under
// the wrong game name) must not crash the process and kick every table on the
// server into a restart loop. Log it and keep serving.
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection:", reason);
});

// Allowed browser origins for the game + lobby API. Localhost is always allowed
// for development; the deployed web origin comes from CLIENT_ORIGIN. Vercel
// preview URLs (*.vercel.app) are allowed via regex so previews work too.
const origins: (string | RegExp)[] = [Origins.LOCALHOST, /\.vercel\.app$/];
if (process.env.CLIENT_ORIGIN) origins.push(process.env.CLIENT_ORIGIN);

// Persist matches in Postgres when DATABASE_URL is set so games survive a
// server restart / spin-down; otherwise fall back to boardgame.io's in-memory
// store (fine for local dev).
//
// Crucially, a DATABASE_URL that points at a missing/unreachable database (a
// free Render Postgres is deleted ~30 days after creation) must NOT crash the
// server. We probe the connection up front and, on failure, fall back to the
// in-memory store so the whole site stays up — matches just won't persist
// until the database is fixed or DATABASE_URL is cleared.
async function resolveDb(): Promise<PostgresStore | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const store = new PostgresStore(process.env.DATABASE_URL);
  try {
    await store.connect();
    return store;
  } catch (err) {
    console.error(
      "[server] DATABASE_URL is set but Postgres is unreachable — falling back to " +
        "IN-MEMORY storage. Matches will NOT survive a restart. Fix the database or " +
        "clear DATABASE_URL to silence this warning.",
      err
    );
    return undefined;
  }
}

async function main() {
  const db = await resolveDb();
  const keepAlive = createKeepAlive();
  const transport = new ActivitySocketIO(keepAlive.markActivity);

  const server = Server({
    games: [FiveHundred, Piratbridge, Pubgolf],
    origins,
    db,
    transport,
    // Matches are private (unlisted) and addressed by a short shareable code.
    // Overriding `uuid` makes the lobby's create endpoint mint these codes.
    uuid: () => makeRoomCode(),
  });

  // A successful room creation is real activity. Register this middleware
  // before boardgame.io appends its own create route during server.run().
  server.router.use("/games/:name/create", async (ctx, next) => {
    await next();
    if (ctx.method === "POST" && ctx.status >= 200 && ctx.status < 300) {
      keepAlive.markActivity();
    }
  });

  const adminConfigured = configureAdminRoutes(server.router, server.db, keepAlive);
  if (!adminConfigured) {
    console.warn("[admin] ADMIN_SECRET is not set — keep-alive controls are disabled");
  }

  // Auto-delete matches once everyone has been gone for the game's idle window.
  // activityGated: only Postgres (db truthy) implements the onWrite hook that
  // lets the sweep safely go dormant between matches, saving Neon compute
  // hours; the in-memory dev fallback keeps the old always-on polling.
  startCleanup(server.db, {
    activityGated: !!db,
    onSweep: ({ unfinishedMatchCount }) => {
      if (unfinishedMatchCount === 0) {
        keepAlive.stopForNoUnfinishedMatches();
      }
    },
  });

  server.run(PORT, () => {
    console.log(`boardgame.io server listening on :${PORT}`);
    console.log(`Games: ${[FiveHundred.name, Piratbridge.name, Pubgolf.name].join(", ")}`);
    console.log(`Storage: ${db ? "Postgres (persistent)" : "in-memory"}`);
  });
}

main().catch((err) => {
  console.error("[server] fatal startup error:", err);
  process.exit(1);
});
