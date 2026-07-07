import type { Server } from "boardgame.io";

type Db = {
  listMatches: (opts?: unknown) => string[] | Promise<string[]>;
  fetch: (
    id: string,
    opts: { metadata: true }
  ) => { metadata?: Server.MatchData } | Promise<{ metadata?: Server.MatchData }>;
  wipe: (id: string) => void | Promise<void>;
};

interface CleanupOpts {
  /** Idle window before a fully-empty match is deleted. Default 15 minutes. */
  idleMs?: number;
  /** How often to sweep. Default 60 seconds. */
  intervalMs?: number;
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
 * Returns a function that stops the sweep.
 */
export function startCleanup(rawDb: unknown, opts: CleanupOpts = {}): () => void {
  const db = rawDb as Db;
  const defaultIdleMs = opts.idleMs ?? FIFTEEN_MINUTES;
  const intervalMs = opts.intervalMs ?? ONE_MINUTE;

  const sweep = async () => {
    try {
      const ids = await Promise.resolve(db.listMatches());
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
        }
      }
    } catch (err) {
      console.error("[cleanup] sweep failed:", err);
    }
  };

  const timer = setInterval(sweep, intervalMs);
  // Don't keep the process alive just for the sweep timer.
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
