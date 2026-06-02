import { LobbyClient } from "boardgame.io/client";
import { GAME_NAME, SERVER_URL } from "./config";

const lobby = new LobbyClient({ server: SERVER_URL });

export interface AvatarChoice {
  styleKey: string;
  seed: string;
}

export interface PlayerData {
  /** Set on seat 0 once the host starts the game. */
  started?: boolean;
  avatarStyle?: string;
  avatarSeed?: string;
}

export interface RoomPlayer {
  id: number;
  name?: string;
  isConnected?: boolean;
  data?: PlayerData;
}

export interface RoomInfo {
  matchID: string;
  players: RoomPlayer[];
  gameover?: unknown;
}

function avatarData(avatar?: AvatarChoice): PlayerData {
  return avatar ? { avatarStyle: avatar.styleKey, avatarSeed: avatar.seed } : {};
}

/** Create a private match and return its 6-char room code. */
export async function createRoom(numPlayers: number): Promise<string> {
  const { matchID } = await lobby.createMatch(GAME_NAME, {
    numPlayers,
    unlisted: true,
  });
  return matchID;
}

/**
 * Join a room by code. Omit `playerID` to take the next open seat (server
 * assigns it). Returns the assigned seat and credentials to persist.
 */
export async function joinRoom(
  code: string,
  playerName: string,
  avatar?: AvatarChoice,
  playerID?: string
): Promise<{ playerID: string; playerCredentials: string }> {
  return lobby.joinMatch(GAME_NAME, code, {
    playerName,
    data: avatarData(avatar),
    ...(playerID !== undefined ? { playerID } : {}),
  });
}

/** Fetch current room metadata (seats + names + avatars) for the waiting room. */
export async function getRoom(code: string): Promise<RoomInfo> {
  const match = await lobby.getMatch(GAME_NAME, code);
  return {
    matchID: match.matchID,
    players: match.players as RoomPlayer[],
    gameover: match.gameover,
  };
}

export async function leaveRoom(
  code: string,
  playerID: string,
  credentials: string
): Promise<void> {
  await lobby.leaveMatch(GAME_NAME, code, { playerID, credentials });
}

/**
 * Host starts the game. We have no server "start" event, so the host (seat 0)
 * records a `started` flag in their player data; every client polls for it and
 * advances to the table together. The host's avatar is merged back in so the
 * update doesn't wipe it.
 */
export async function startRoom(
  code: string,
  playerID: string,
  credentials: string,
  avatar?: AvatarChoice
): Promise<void> {
  await lobby.updatePlayer(GAME_NAME, code, {
    playerID,
    credentials,
    data: { started: true, ...avatarData(avatar) },
  });
}
