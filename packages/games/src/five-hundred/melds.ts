import type { Card, Suit } from "../cards";
import type { Declaration, Meld, PlacedCard, PlayerID } from "./types";

// House rule: the Ace is unbounded and bridges King and 2, so runs may wrap
// through it (…Q-K-A-2-3…). Ranks are therefore treated on a 13-position circle
// (A=1 … K=13, then back to A). A run is any contiguous arc of 3–13 of them.

export interface ResolveResult {
  ok: boolean;
  error?: string;
  suit?: Suit;
  resolved?: ResolvedCard[];
}

interface ResolvedCard {
  card: Card;
  asRank: number; // 1..13 (A=1, J=11, Q=12, K=13)
  asSuit: Suit;
}

function declarationFor(
  cardId: string,
  declarations: Declaration[]
): Declaration | undefined {
  return declarations.find((d) => d.cardId === cardId);
}

/** Resolve raw cards + declarations into ranks/suit for one suit. */
function resolveCards(
  cards: Card[],
  declarations: Declaration[],
  forcedSuit?: Suit
): ResolveResult {
  const realSuits = new Set(
    cards.filter((c) => !c.isJoker).map((c) => c.suit as Suit)
  );
  if (forcedSuit) realSuits.add(forcedSuit);
  if (realSuits.size > 1) {
    return { ok: false, error: "All cards in a run must be the same suit." };
  }
  const suit = forcedSuit ?? [...realSuits][0];
  if (!suit) {
    return { ok: false, error: "A run needs at least one real (non-joker) card." };
  }

  const resolved: ResolvedCard[] = [];
  for (const card of cards) {
    if (card.isJoker) {
      const decl = declarationFor(card.id, declarations);
      if (!decl || typeof decl.asRank !== "number") {
        return { ok: false, error: "Each joker must declare the card it represents." };
      }
      resolved.push({ card, asRank: decl.asRank, asSuit: suit });
      continue;
    }
    if (card.suit !== suit) {
      return { ok: false, error: "All cards in a run must be the same suit." };
    }
    resolved.push({ card, asRank: card.rank, asSuit: suit });
  }
  return { ok: true, suit, resolved };
}

/**
 * If the distinct ranks form a contiguous arc on the 13-rank circle, return the
 * arc's starting rank; otherwise null. Length must be 3–13.
 */
function circularStart(ranks: number[]): number | null {
  const n = ranks.length;
  if (n < 3 || n > 13) return null;
  const set = new Set(ranks);
  if (set.size !== n) return null; // no duplicate ranks
  for (let start = 1; start <= 13; start++) {
    let ok = true;
    for (let k = 0; k < n; k++) {
      const r = ((start - 1 + k) % 13) + 1;
      if (!set.has(r)) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return null;
}

/** Order placed cards along the arc starting at `start` (so K-A-2 reads in order). */
function orderByArc(placed: PlacedCard[], start: number): PlacedCard[] {
  const pos = (r: number) => (r - start + 13) % 13;
  return [...placed].sort((a, b) => pos(a.asRank) - pos(b.asRank));
}

function toPlaced(resolved: ResolvedCard[], placedBy: PlayerID): PlacedCard[] {
  return resolved.map((r) => ({
    card: r.card,
    placedBy,
    asRank: r.asRank,
    asSuit: r.asSuit,
  }));
}

export interface MeldResult {
  ok: boolean;
  error?: string;
  meld?: Meld;
}

/** Validate and build a brand-new meld (3+ sequential same-suit cards). */
export function validateNewMeld(
  cards: Card[],
  declarations: Declaration[],
  placedBy: PlayerID,
  meldId: string
): MeldResult {
  if (cards.length < 3) {
    return { ok: false, error: "A meld needs at least 3 cards." };
  }
  const res = resolveCards(cards, declarations);
  if (!res.ok || !res.resolved || !res.suit) {
    return { ok: false, error: res.error };
  }
  const ranks = res.resolved.map((r) => r.asRank);
  const start = circularStart(ranks);
  if (start === null) {
    return { ok: false, error: "Cards must form a run with no gaps or duplicates." };
  }
  return {
    ok: true,
    meld: { id: meldId, suit: res.suit, cards: orderByArc(toPlaced(res.resolved, placedBy), start) },
  };
}

/**
 * Validate extending an existing meld. Returns the new ordered card list to
 * replace `meld.cards`. Added cards are scored by `placedBy` (which may differ
 * from the original owner — points go to whoever places them).
 */
export function validateExtend(
  meld: Meld,
  cards: Card[],
  declarations: Declaration[],
  placedBy: PlayerID
): { ok: boolean; error?: string; cards?: PlacedCard[] } {
  if (cards.length < 1) {
    return { ok: false, error: "Choose at least one card to add." };
  }
  const res = resolveCards(cards, declarations, meld.suit);
  if (!res.ok || !res.resolved) {
    return { ok: false, error: res.error };
  }
  const added = toPlaced(res.resolved, placedBy);
  const combined = [...meld.cards, ...added];
  const start = circularStart(combined.map((c) => c.asRank));
  if (start === null) {
    return { ok: false, error: "Added cards must extend the run with no gaps or duplicates." };
  }
  return { ok: true, cards: orderByArc(combined, start) };
}

/**
 * The real card a placed joker represents, so an opponent holding it may swap.
 * Returns the suit + rank (1–13) of the concrete card.
 */
export function jokerRepresents(placed: PlacedCard): { suit: Suit; rank: number } {
  return { suit: placed.asSuit, rank: placed.asRank };
}

/**
 * Check whether two same-suit melds can be joined into one contiguous run
 * (e.g. 2-3-4 + 6-7-8 become 2-3-4-5-6-7-8 once a 5 bridges them). Returns
 * the merged, arc-ordered card list if they connect, or null if they don't.
 */
export function tryMergeMelds(a: Meld, b: Meld): PlacedCard[] | null {
  if (a.suit !== b.suit) return null;
  const combined = [...a.cards, ...b.cards];
  const start = circularStart(combined.map((c) => c.asRank));
  if (start === null) return null;
  return orderByArc(combined, start);
}
