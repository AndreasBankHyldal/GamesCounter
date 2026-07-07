import { LobbyClient } from "boardgame.io/client";
import { GAME_IDS, GAME_NAME, SERVER_URL } from "./config";

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
  /** Set on seat 0 when admin proposes a rematch. */
  rematchPending?: boolean;
  /** Set on each player when they accept the rematch invite. */
  rematchAccepted?: boolean;
  /** Set on seat 0 once admin has created the new room — the new room code. */
  rematchCode?: string;
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
  /** Resolved game id (e.g. "five-hundred" or "piratbridge"). */
  gameId: string;
}

function avatarData(avatar?: AvatarChoice): PlayerData {
  return avatar ? { avatarStyle: avatar.styleKey, avatarSeed: avatar.seed } : {};
}

/**
 * Resolve which game a room code belongs to. boardgame.io's
 * GET /games/:name/:id ignores the :name segment and fetches by matchID
 * alone, so we can ask under any namespace — the response's `gameName`
 * metadata field is the authoritative answer.
 */
export async function resolveGame(code: string): Promise<string> {
  const match = await lobby.getMatch(GAME_NAME, code);
  return (match as { gameName?: string }).gameName ?? GAME_NAME;
}

/** Create a private match and return its 6-char room code. */
export async function createRoom(
  numPlayers: number,
  options?: { jokers?: number; winningScore?: number; startingCards?: number; openFinalRound?: boolean },
  gameId: string = GAME_NAME
): Promise<string> {
  const { matchID } = await lobby.createMatch(gameId, {
    numPlayers,
    unlisted: true,
    setupData:
      gameId === GAME_IDS.pubgolf
        ? {}
        : gameId === GAME_IDS.piratbridge
          ? {
              startingCards: options?.startingCards,
              openFinalRound: options?.openFinalRound ?? false,
            }
          : {
              jokers: options?.jokers ?? 2,
              winningScore: options?.winningScore ?? 500,
            },
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
  playerID?: string,
  gameId: string = GAME_NAME
): Promise<{ playerID: string; playerCredentials: string }> {
  return lobby.joinMatch(gameId, code, {
    playerName,
    data: avatarData(avatar),
    ...(playerID !== undefined ? { playerID } : {}),
  });
}

/** Fetch current room metadata (seats + names + avatars) for the waiting room.
 *  The returned gameId always comes from the match's own metadata, so a stale
 *  or wrong hint can never misidentify the game. */
export async function getRoom(code: string, gameId?: string): Promise<RoomInfo> {
  const match = await lobby.getMatch(gameId ?? GAME_NAME, code);
  return {
    matchID: match.matchID,
    players: match.players as RoomPlayer[],
    gameover: match.gameover,
    gameId: (match as { gameName?: string }).gameName ?? gameId ?? GAME_NAME,
  };
}

/** Update arbitrary fields on a player's metadata without wiping existing data. */
export async function updatePlayerData(
  code: string,
  playerID: string,
  credentials: string,
  data: PlayerData,
  gameId: string = GAME_NAME
): Promise<void> {
  await lobby.updatePlayer(gameId, code, { playerID, credentials, data });
}

export async function leaveRoom(
  code: string,
  playerID: string,
  credentials: string,
  gameId: string = GAME_NAME
): Promise<void> {
  await lobby.leaveMatch(gameId, code, { playerID, credentials });
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
  avatar?: AvatarChoice,
  gameId: string = GAME_NAME
): Promise<void> {
  await lobby.updatePlayer(gameId, code, {
    playerID,
    credentials,
    data: { started: true, ...avatarData(avatar) },
  });
}
