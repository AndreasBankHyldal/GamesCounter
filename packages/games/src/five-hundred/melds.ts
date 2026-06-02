import type { Card, Suit } from "../cards";
import type { Declaration, Meld, PlacedCard, PlayerID } from "./types";

export interface ResolveResult {
  ok: boolean;
  error?: string;
  suit?: Suit;
  resolved?: ResolvedCard[];
}

interface ResolvedCard {
  card: Card;
  asRank: number;
  asSuit: Suit;
}

function declarationFor(
  cardId: string,
  declarations: Declaration[]
): Declaration | undefined {
  return declarations.find((d) => d.cardId === cardId);
}

/** Resolve raw cards + declarations into sequence ranks/suits for one suit. */
function resolveCards(
  cards: Card[],
  declarations: Declaration[],
  forcedSuit?: Suit
): ResolveResult {
  // Determine the meld suit from the real (non-joker) cards.
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
    const decl = declarationFor(card.id, declarations);
    if (card.isJoker) {
      if (!decl || typeof decl.asRank !== "number") {
        return { ok: false, error: "Each joker must declare the card it represents." };
      }
      resolved.push({ card, asRank: decl.asRank, asSuit: suit });
      continue;
    }
    if (card.suit !== suit) {
      return { ok: false, error: "All cards in a run must be the same suit." };
    }
    // Aces may be declared high (14) or low (1); default to low.
    if (card.rank === 1) {
      const asRank = decl?.asRank === 14 ? 14 : 1;
      resolved.push({ card, asRank, asSuit: suit });
    } else {
      resolved.push({ card, asRank: card.rank, asSuit: suit });
    }
  }
  return { ok: true, suit, resolved };
}

/** True when ranks form a gap-free, duplicate-free ascending run. */
function isConsecutiveDistinct(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) return false; // duplicate rank
    if (sorted[i] !== sorted[i - 1] + 1) return false; // gap
  }
  return true;
}

function toPlaced(resolved: ResolvedCard[], placedBy: PlayerID): PlacedCard[] {
  return resolved
    .map((r) => ({ card: r.card, placedBy, asRank: r.asRank, asSuit: r.asSuit }))
    .sort((a, b) => a.asRank - b.asRank);
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
  if (ranks.some((r) => r < 1 || r > 14)) {
    return { ok: false, error: "Card ranks out of range." };
  }
  if (!isConsecutiveDistinct(ranks)) {
    return { ok: false, error: "Cards must form a gap-free run with no duplicates." };
  }
  return {
    ok: true,
    meld: { id: meldId, suit: res.suit, cards: toPlaced(res.resolved, placedBy) },
  };
}

/**
 * Validate extending an existing meld at either end. Returns the new sorted
 * card list to replace `meld.cards`. The added cards are scored by `placedBy`
 * (which may differ from the original meld owner — points go to the placer).
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
  const combined = [...meld.cards, ...added].sort((a, b) => a.asRank - b.asRank);
  const ranks = combined.map((c) => c.asRank);
  if (ranks.some((r) => r < 1 || r > 14)) {
    return { ok: false, error: "Card ranks out of range." };
  }
  if (!isConsecutiveDistinct(ranks)) {
    return { ok: false, error: "Added cards must extend the run with no gaps or duplicates." };
  }
  return { ok: true, cards: combined };
}

/**
 * The real card a placed joker represents, so an opponent holding it may swap.
 * Returns the suit + rank (1–13) of the concrete card; ace-high (14) maps to 1.
 */
export function jokerRepresents(placed: PlacedCard): { suit: Suit; rank: number } {
  const rank = placed.asRank === 14 ? 1 : placed.asRank;
  return { suit: placed.asSuit, rank };
}
