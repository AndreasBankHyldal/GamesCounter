"use client";

import { Client } from "boardgame.io/react";
import { Local } from "boardgame.io/multiplayer";
import { RandomBot } from "boardgame.io/ai";
import { FiveHundred } from "@gamescounter/games";
import { botEnumerate } from "@gamescounter/games/five-hundred";
import { FiveHundredBoard } from "@/components/multiplayer/FiveHundredBoard";

// Attach the AI enumerate function so the Local transport can drive the bot.
//
// We also strip the `activePlayers`/`stages` turn config used in multiplayer
// (which keeps every seat "active" so off-turn players can send `leaveGame`).
// boardgame.io's Local bot driver treats *any* active player as "the bot may
// play now", so leaving those on would fire the bot on every state update —
// including the human's turn. Solo has no one to unblock, so off-turn leaving
// isn't needed here; the bot only plays on its own turn.
const FiveHundredWithAI = {
  ...FiveHundred,
  ai: { enumerate: botEnumerate },
  turn: { ...FiveHundred.turn, activePlayers: undefined, stages: undefined },
};

/**
 * boardgame.io client for solo play against a RandomBot on seat "1".
 * Uses Local (in-browser) transport — no server required.
 */
export const SoloClient = Client({
  game: FiveHundredWithAI,
  board: FiveHundredBoard,
  multiplayer: Local({ bots: { "1": RandomBot } }),
  numPlayers: 2,
  debug: false,
});
