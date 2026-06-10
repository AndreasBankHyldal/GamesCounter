import type { Card } from "../cards";

export type PlayerID = string;

export interface TrickCard {
  playerID: PlayerID;
  card: Card;
}

/** A finished trick, kept on the table until the winner leads the next one. */
export interface CompletedTrick {
  cards: TrickCard[];
  winnerID: PlayerID;
}

export interface RoundResult {
  roundNumber: number;
  cardsDealt: number;
  bets: Record<PlayerID, number>;
  tricksWon: Record<PlayerID, number>;
  deltas: Record<PlayerID, number>;
  cumulativeScores: Record<PlayerID, number>;
}

export type GamePhase = "betting" | "playing" | "roundOver" | "gameOver";

export interface PiratbridgeState {
  /** Each player's current hand. Secret: redacted in playerView for opponents. */
  hands: Record<PlayerID, Card[]>;
  /** Leftover cards not dealt this round (remainder of 52 / numPlayers). */
  spareCards: Card[];
  /** Current round bets. null = not yet bet. -1 in playerView = bet placed but hidden. */
  bets: Record<PlayerID, number | null>;
  betsRevealed: boolean;
  /** Cards played in the current trick, in play order. */
  currentTrick: TrickCard[];
  /** The previous trick, shown on the table until the next trick starts. */
  lastTrick: CompletedTrick | null;
  /** Suit of the first card played in the current trick. */
  leadSuit: string | null;
  /** PlayerID who leads (plays first in) the current/next trick. */
  trickLeader: PlayerID;
  /** Number of tricks completed this round. */
  trickCount: number;
  tricksWon: Record<PlayerID, number>;
  scores: Record<PlayerID, number>;
  roundHistory: RoundResult[];
  /** Results from the most recently completed round (for the results screen). */
  lastRound: RoundResult | null;
  roundNumber: number;
  cardsThisRound: number;
  /** Seat index (0-based) of the dealer this round. Rotates each round. */
  dealerSeat: number;
  /** From setupData: how many cards to start the first round with. */
  startingCards: number;
  /** From setupData: in the 1-card round, each player cannot see their own card. */
  openFinalRound: boolean;
  phase: GamePhase;
  log: string[];
  /** Computed by playerView: number of cards in each player's hand. */
  handCounts?: Record<PlayerID, number>;
}

export interface PiratbridgeSetupData {
  startingCards?: number;
  openFinalRound?: boolean;
}
