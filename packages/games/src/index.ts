import type { Game } from "boardgame.io";
import { FiveHundred } from "./five-hundred/game";
import { Piratbridge } from "./piratbridge/game";

export * from "./cards";
export * from "./five-hundred";
// Selective export to avoid collision with five-hundred's RoundResult/scoreRound.
export { Piratbridge } from "./piratbridge/game";
export type {
  PiratbridgeState,
  PiratbridgeSetupData,
  TrickCard,
  CompletedTrick,
  GamePhase,
} from "./piratbridge/types";

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
  piratbridge: {
    id: "piratbridge",
    name: "Piratbridge",
    tagline: "Bid blind, play trump — most points wins.",
    minPlayers: 2,
    maxPlayers: 6,
    game: Piratbridge,
  },
};

export const GAMES: GameInfo[] = Object.values(GAME_REGISTRY);

export function getGameInfo(id: string): GameInfo | undefined {
  return GAME_REGISTRY[id];
}
