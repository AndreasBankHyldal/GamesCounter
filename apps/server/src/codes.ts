// 6-character room codes. We override boardgame.io's match-ID generator with
// these so the lobby's standard create endpoint returns a human-shareable code
// (instead of a UUID). Ambiguous characters (0/O, 1/I) are excluded.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
