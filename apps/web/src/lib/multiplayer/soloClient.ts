"use client";

import { Client } from "boardgame.io/react";
import { Local } from "boardgame.io/multiplayer";
import { RandomBot } from "boardgame.io/ai";
import { FiveHundred } from "@gamescounter/games";
import { botEnumerate } from "@gamescounter/games/five-hundred";
import { FiveHundredBoard } from "@/components/multiplayer/FiveHundredBoard";

// Attach the AI enumerate function so the Local transport can drive the bot.
const FiveHundredWithAI = { ...FiveHundred, ai: { enumerate: botEnumerate } };

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
