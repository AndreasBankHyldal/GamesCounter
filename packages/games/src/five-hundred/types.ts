import type { Card, Suit } from "../cards";

export type PlayerID = string;

/**
 * How a card is being played into a meld. Required for jokers (which need a
 * declared rank + suit) and for aces (which may sit low = 1 or high = 14).
 * `asRank` uses 1–14 sequence positions: ace-low = 1, ace-high = 14.
 */
export interface Declaration {
  cardId: string;
  asRank: number;
  asSuit?: Suit;
}

/** A card sitting in a meld on the table, with the player who scores it. */
export interface PlacedCard {
  card: Card;
  /** Player whose score this card counts toward (the one who placed it). */
  placedBy: PlayerID;
  /** Resolved sequence position 1–14 (ace-high = 14). */
  asRank: number;
  /** Resolved suit — equals the meld's suit (jokers adopt it). */
  asSuit: Suit;
}

/** A run of 3+ same-suit, sequential cards laid face-up on the table. */
export interface Meld {
  id: string;
  suit: Suit;
  /** Always kept sorted ascending by `asRank`. */
  cards: PlacedCard[];
}

/** Per-player score change applied when a round is scored. */
export interface RoundResult {
  roundNumber: number;
  closedBy: PlayerID;
  deltas: Record<PlayerID, number>;
}

export interface FiveHundredState {
  /** Face-down draw pile (SECRET — redacted by playerView). */
  stock: Card[];
  /** Face-up pile; the last element is the top / most recent discard. */
  faceUp: Card[];
  /** Each player's hand (SECRET — redacted by playerView). */
  hands: Record<PlayerID, Card[]>;
  melds: Meld[];
  /** Cumulative scores across rounds. */
  scores: Record<PlayerID, number>;
  /** Number of jokers in the deck (0–4), chosen at match creation. */
  jokers: number;
  /** Cumulative score that wins the game (100–1000), chosen at match creation. */
  winningScore: number;
  roundNumber: number;
  /** Turns taken so far in the current hand (resets each deal). Melding only
   * opens once this exceeds the player count — i.e. everyone has had one turn. */
  turnsThisRound: number;
  /** Player who closed the current round, else null. */
  closedBy: PlayerID | null;
  /** The face-down card placed on the pile when closing — revealable on peek. */
  closingCard: Card | null;
  /** True while a round is scored and waiting for "continue to next round". */
  roundOver: boolean;
  /** Set once someone reaches the winning score — drives `endIf` (game over). */
  finished: boolean;
  /** Result of the closing hand, for the UI. */
  lastRound: RoundResult | null;
  /** Id of the card the current player just drew (for the hand highlight). */
  lastDrawnId: string | null;
  /** Short human-readable event log (most recent last). Player references use
   * `@@<id>@@` tokens so the client can substitute display names. */
  log: string[];

  // ---- Per-turn flags (reset in turn.onBegin) ----
  hasDrawn: boolean;
  /** Took the entire face-up pile this turn (owes a meld or −50). */
  tookPile: boolean;
  /** Must play a meld before discarding, else −50. */
  mustMeld: boolean;
  /** Played or extended a meld this turn. */
  meldedThisTurn: boolean;

  // ---- Populated only inside playerView (client-facing) ----
  /** Number of face-down cards remaining (stock contents are hidden). */
  stockCount?: number;
  /** Card counts per player (own hand is shown in full via `hands`). */
  handCounts?: Record<PlayerID, number>;
}
