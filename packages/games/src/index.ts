import type { Game } from "boardgame.io";
import { FiveHundred } from "./five-hundred/game";

export * from "./cards";
export * from "./five-hundred";

/** Display metadata for each multiplayer game, keyed by its boardgame.io name. */
export interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  game: Game;
}

export const GAME_REGISTRY: Record<string, GameInfo> = {
  "five-hundred": {
    id: "five-hundred",
    name: "500",
    tagline: "Draw, meld and close — first to 500 wins.",
    minPlayers: 2,
    maxPlayers: 6,
    game: FiveHundred,
  },
};

export const GAMES: GameInfo[] = Object.values(GAME_REGISTRY);

export function getGameInfo(id: string): GameInfo | undefined {
  return GAME_REGISTRY[id];
}
