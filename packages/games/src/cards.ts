// Framework-agnostic playing-card model shared by every game in this package.
// Shuffling is deliberately NOT done here — it must run inside boardgame.io's
// `random` plugin (server-authoritative + reproducible), so this file stays pure.

export type Suit = "spade" | "heart" | "diamond" | "club";

export const SUITS: readonly Suit[] = ["spade", "heart", "diamond", "club"];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

export const SUIT_COLOR: Record<Suit, "red" | "black"> = {
  spade: "black",
  club: "black",
  heart: "red",
  diamond: "red",
};

/**
 * A single card.
 * - `rank` is 1–13 (A=1, J=11, Q=12, K=13) for suited cards, `0` for jokers.
 * - `suit` is `null` for jokers.
 * Aces (rank 1) can play high or low in melds; that choice lives in the meld
 * placement, not on the card itself (see five-hundred/types.ts `Declaration`).
 */
export interface Card {
  /** Stable id, unique within one dealt deck (e.g. "heart-7", "joker-1"). */
  id: string;
  suit: Suit | null;
  rank: number;
  isJoker: boolean;
}

export const RANK_LABEL: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

/** Point value used for scoring (joker 25, ace 15, 10/J/Q/K 10, 2–9 5). */
export function cardValue(card: Card): number {
  if (card.isJoker) return 25;
  if (card.rank === 1) return 15; // ace
  if (card.rank >= 10) return 10; // 10, J, Q, K
  return 5; // 2–9
}

/** Human label for a card, e.g. "A♥", "10♠", "🃏". */
export function formatCard(card: Card): string {
  if (card.isJoker) return "🃏";
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  return `${rank}${SUIT_SYMBOL[card.suit as Suit]}`;
}

/**
 * A fresh, ordered deck: standard 52 cards + `jokerCount` jokers (default 2,
 * clamped to 0–4). Caller shuffles.
 */
export function buildDeck(jokerCount = 2): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, isJoker: false });
    }
  }
  const jokers = Math.max(0, Math.min(4, Math.floor(jokerCount)));
  for (let i = 1; i <= jokers; i++) {
    deck.push({ id: `joker-${i}`, suit: null, rank: 0, isJoker: true });
  }
  return deck;
}
