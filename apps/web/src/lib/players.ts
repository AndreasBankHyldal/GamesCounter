import { randomSeed, randomStyleKey } from "./avatar";

export interface Player {
  id: string;
  name: string;
  avatarStyle: string;
  avatarSeed: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function createPlayer(name: string): Player {
  return {
    id: newId(),
    name,
    // Players who never open the picker still get a random avatar.
    avatarStyle: randomStyleKey(),
    avatarSeed: randomSeed(),
  };
}
