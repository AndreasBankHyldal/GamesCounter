import type { Player } from "./players";
import { makeRound, pirateStartCards, type Round } from "./scoring";

export type GameStatus = "active" | "finished";

export interface GameSession {
  id: string;
  slug: string;
  name: string;
  players: Player[];
  rounds: Round[];
  status: GameStatus;
  createdAt: number;
  updatedAt: number;
  /** Score target for 500 (wins) or Jona's spil (loses). */
  winningScore?: number;
  /**
   * Position in a rematch chain: 1 for the first rematch, 2 for a rematch of
   * that one, and so on. Resolved at creation so the name stays correct even
   * if the game it was a rematch of is later deleted.
   */
  rematchNumber?: number;
}

const KEY = "gc:sessions";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function loadSessions(): GameSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as GameSession[];
  } catch {
    return [];
  }
}

function persist(list: GameSession[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function getSession(id: string): GameSession | undefined {
  return loadSessions().find((s) => s.id === id);
}

/** Insert or replace a session, bumping updatedAt. Returns the saved value. */
export function upsertSession(session: GameSession): GameSession {
  const list = loadSessions();
  const saved = { ...session, updatedAt: Date.now() };
  const index = list.findIndex((s) => s.id === session.id);
  if (index >= 0) list[index] = saved;
  else list.push(saved);
  persist(list);
  return saved;
}

export function deleteSession(id: string) {
  persist(loadSessions().filter((s) => s.id !== id));
}

/** Sessions for a game type, most recently updated first. */
export function sessionsForSlug(slug: string): GameSession[] {
  return loadSessions()
    .filter((s) => s.slug === slug)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function autoName(
  players: Player[],
  ts: number,
  rematchNumber?: number
): string {
  const date = new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const names = players.map((p) => p.name).join(", ");
  const suffix = rematchNumber ? ` · Rematch ${rematchNumber}` : "";
  return `${date} · ${names}${suffix}`;
}

export interface CreateSessionOptions {
  slug: string;
  players: Player[];
  /** Pirate Bridge only: cards dealt in the first round (= round count). */
  startCards?: number;
  /** 500 / Jona's spil only: the score that ends the game. */
  winningScore?: number;
  /** The finished session this is a rematch of, if any. */
  rematchOf?: GameSession;
}

export function createSession({
  slug,
  players,
  startCards,
  winningScore,
  rematchOf,
}: CreateSessionOptions): GameSession {
  const now = Date.now();
  // Pirate Bridge has a fixed schedule of rounds; pre-create them empty.
  // The starting card count is clamped to [1, deck max] for a shorter match.
  const max = pirateStartCards(players.length);
  const count = Math.max(1, Math.min(startCards ?? max, max));
  const rounds: Round[] =
    slug === "piratbridge"
      ? Array.from({ length: count }, () => makeRound())
      : [];

  const rematchNumber = rematchOf
    ? (rematchOf.rematchNumber ?? 0) + 1
    : undefined;

  const session: GameSession = {
    id: newId(),
    slug,
    name: autoName(players, now, rematchNumber),
    players,
    rounds,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...((slug === "500" || slug === "jonas-spil") && winningScore
      ? { winningScore }
      : {}),
    ...(rematchNumber ? { rematchNumber } : {}),
  };
  return upsertSession(session);
}
