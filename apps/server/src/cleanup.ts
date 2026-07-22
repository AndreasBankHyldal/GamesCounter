import type { Server } from "boardgame.io";

type Db = {
  listMatches: (opts?: unknown) => string[] | Promise<string[]>;
  fetch: (
    id: string,
    opts: { metadata: true }
  ) => { metadata?: Server.MatchData } | Promise<{ metadata?: Server.MatchData }>;
  wipe: (id: string) => void | Promise<void>;
  /**
   * Optional hook (implemented by PostgresStore) fired after any mutating
   * call. We use it to wake the sweep back up from dormant mode instead of
   * polling Postgres forever.
   */
  onWrite?: (() => void) | null;
};

interface CleanupOpts {
  /** Idle window before a fully-empty match is deleted. Default 15 minutes. */
  idleMs?: number;
  /** How often to sweep. Default 60 seconds. */
  intervalMs?: number;
  /**
   * Whether it's safe to go dormant (stop polling) between matches. Only
   * true when `rawDb` actually calls `onWrite` on every mutation (currently
   * just PostgresStore) — the in-memory dev fallback never calls it, so
   * going dormant there would mean the sweep never wakes back up. Defaults
   * to false (always-on polling, the old/safe behavior) so callers must
   * opt in explicitly once they know their store supports the hook.
   */
  activityGated?: boolean;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

/** Per-game idle grace period. Pubgolf crawls run all night with phones
 *  locked between pubs, so they need a much longer window than card games. */
const GRACE_BY_GAME: Record<string, number> = {
  pubgolf: EIGHT_HOURS,
};

/**
 * Periodically delete matches where every player is disconnected and there has
 * been no activity for the game's idle window. boardgame.io's SocketIO transport
 * flips `isConnected` per player and bumps `updatedAt` on each action; if a build
 * never sets `isConnected`, the idle-time check alone still reaps dead matches.
 *
 * When `opts.activityGated` is true (pass this for a real Postgres-backed
 * store, e.g. Neon): a permanent setInterval polling Postgres 24/7 defeats
 * Neon's free-tier autosuspend (it suspends after 5 min of no queries), so
 * instead we only run the sweep timer while there's something to actually
 * watch. Once a sweep finds the match table empty, we go dormant (no timer,
 * zero DB queries) until `db.onWrite` tells us a match was created/updated
 * again. This lets the database fully suspend during quiet periods while
 * still reaping idle matches promptly whenever games are in progress.
 * Leave it false (the default) for stores that never call `onWrite` — e.g.
 * the in-memory dev fallback — where going dormant would mean the sweep
 * never wakes back up; those keep the old always-on polling behavior.
 *
 * Returns a function that stops the sweep for good (e.g. on shutdown).
 */
export function startCleanup(rawDb: unknown, opts: CleanupOpts = {}): () => void {
  const db = rawDb as Db;
  const defaultIdleMs = opts.idleMs ?? FIFTEEN_MINUTES;
  const intervalMs = opts.intervalMs ?? ONE_MINUTE;
  const activityGated = opts.activityGated ?? false;

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const goDormant = () => {
    if (!activityGated || !timer) return;
    clearInterval(timer);
    timer = null;
    console.log("[cleanup] no matches to watch — going dormant (DB queries paused)");
  };

  const sweep = async () => {
    try {
      const ids = await Promise.resolve(db.listMatches());
      let survivingCount = 0;
      for (const id of ids) {
        const { metadata } = await Promise.resolve(db.fetch(id, { metadata: true }));
        if (!metadata) continue;
        const players = Object.values(metadata.players ?? {});
        const anyConnected = players.some((p) => p?.isConnected);
        const lastActivity = metadata.updatedAt ?? metadata.createdAt ?? 0;
        const idleFor = Date.now() - lastActivity;
        const idleMs = GRACE_BY_GAME[metadata.gameName ?? ""] ?? defaultIdleMs;
        if (!anyConnected && idleFor > idleMs) {
          await Promise.resolve(db.wipe(id));
          console.log(`[cleanup] wiped idle match ${id} (idle ${Math.round(idleFor / 1000)}s)`);
        } else {
          survivingCount++;
        }
      }
      if (survivingCount === 0) goDormant();
    } catch (err) {
      console.error("[cleanup] sweep failed:", err);
    }
  };

  const startActive = () => {
    if (stopped || timer) return; // already ticking (or shut down) — nothing to do
    timer = setInterval(sweep, intervalMs);
    // Don't keep the process alive just for the sweep timer.
    (timer as { unref?: () => void }).unref?.();
    if (activityGated) {
      console.log("[cleanup] activity detected — sweeping every " +
        `${Math.round(intervalMs / 1000)}s until matches are idle/empty`);
    }
  };

  // Wake back up (from dormant mode) whenever a match is created/updated/wiped.
  // Harmless to set even when activityGated is false (startActive() is a
  // no-op once the permanent timer is already running).
  if (activityGated) db.onWrite = () => startActive();

  // One immediate sweep at boot catches leftover matches from a prior
  // restart/deploy; startActive() then keeps ticking (permanently if not
  // activity-gated, or only while matches remain if it is).
  startActive();
  void sweep();

  return () => {
    stopped = true;
    if (db.onWrite) db.onWrite = null;
    if (timer) clearInterval(timer);
    timer = null;
  };
}
