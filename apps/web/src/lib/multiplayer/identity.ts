// Per-room identity stored locally so a disconnected player can rejoin the same
// seat with the same credentials (boardgame.io reconnects using these).

export interface Identity {
  playerID: string;
  credentials: string;
  name: string;
  avatarStyle?: string;
  avatarSeed?: string;
}

const key = (code: string) => `gc:mp:${code.toUpperCase()}`;

export function saveIdentity(code: string, identity: Identity): void {
  try {
    window.localStorage.setItem(key(code), JSON.stringify(identity));
  } catch {
    /* storage unavailable */
  }
}

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = window.localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function clearIdentity(code: string): void {
  try {
    window.localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}
