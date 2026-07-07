// Base URL of the boardgame.io server (lobby REST + SocketIO game transport).
// Set NEXT_PUBLIC_SERVER_URL in production (e.g. the Render URL); defaults to
// the local dev server.
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8000";

export const GAME_IDS = {
  fiveHundred: "five-hundred",
  piratbridge: "piratbridge",
  pubgolf: "pubgolf",
} as const;

export type GameId = (typeof GAME_IDS)[keyof typeof GAME_IDS];

/** @deprecated Use GAME_IDS.fiveHundred */
export const GAME_NAME = GAME_IDS.fiveHundred;
