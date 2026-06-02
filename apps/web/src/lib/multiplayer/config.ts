// Base URL of the boardgame.io server (lobby REST + SocketIO game transport).
// Set NEXT_PUBLIC_SERVER_URL in production (e.g. the Render URL); defaults to
// the local dev server.
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8000";

/** boardgame.io game name — must match FiveHundred.name on the server. */
export const GAME_NAME = "five-hundred";
