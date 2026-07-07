"use client";

import { Client } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import { FiveHundred, Piratbridge, Pubgolf } from "@gamescounter/games";
import { FiveHundredBoard } from "@/components/multiplayer/FiveHundredBoard";
import { PiratbridgeBoard } from "@/components/multiplayer/PiratbridgeBoard";
import { PubgolfBoard } from "@/components/multiplayer/PubgolfBoard";
import { SERVER_URL } from "./config";

/**
 * boardgame.io React client for 500, wired to the server over SocketIO.
 * Render with match props, e.g.
 *   <FiveHundredClient matchID={code} playerID="0" credentials={creds} />
 */
export const FiveHundredClient = Client({
  game: FiveHundred,
  board: FiveHundredBoard,
  multiplayer: SocketIO({ server: SERVER_URL }),
  debug: false,
});

/**
 * boardgame.io React client for Piratbridge, wired to the server over SocketIO.
 */
export const PiratbridgeClient = Client({
  game: Piratbridge,
  board: PiratbridgeBoard,
  multiplayer: SocketIO({ server: SERVER_URL }),
  debug: false,
});

/**
 * boardgame.io React client for Pubgolf, wired to the server over SocketIO.
 */
export const PubgolfClient = Client({
  game: Pubgolf,
  board: PubgolfBoard,
  multiplayer: SocketIO({ server: SERVER_URL }),
  debug: false,
});
