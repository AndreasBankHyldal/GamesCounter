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

function autoName(players: Player[], ts: number): string {
  const date = new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const names = players.map((p) => p.name).join(", ");
  return `${date} · ${names}`;
}

export function createSession(
  slug: string,
  players: Player[],
  startCards?: number
): GameSession {
  const now = Date.now();
  // Pirate Bridge has a fixed schedule of rounds; pre-create them empty.
  // The starting card count is clamped to [1, deck max] for a shorter match.
  const max = pirateStartCards(players.length);
  const count = Math.max(1, Math.min(startCards ?? max, max));
  const rounds: Round[] =
    slug === "piratbridge"
      ? Array.from({ length: count }, () => makeRound())
      : [];

  const session: GameSession = {
    id: newId(),
    slug,
    name: autoName(players, now),
    players,
    rounds,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  return upsertSession(session);
}
