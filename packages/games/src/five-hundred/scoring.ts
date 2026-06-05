import { cardValue } from "../cards";
import type { FiveHundredState, PlayerID, RoundResult } from "./types";

/**
 * Score a round at close:
 *   + value of every card a player has placed in melds on the table
 *   − value of every card still in that player's hand
 * Joker = 25, Ace = 15, 10/J/Q/K = 10, 2–9 = 5. Totals may go negative.
 */
export function scoreRound(
  G: FiveHundredState,
  playerIDs: PlayerID[],
  closedBy: PlayerID | null
): RoundResult {
  const deltas: Record<PlayerID, number> = Object.fromEntries(
    playerIDs.map((id) => [id, 0])
  );

  for (const meld of G.melds) {
    for (const placed of meld.cards) {
      deltas[placed.placedBy] = (deltas[placed.placedBy] ?? 0) + cardValue(placed.card);
    }
  }

  for (const id of playerIDs) {
    for (const card of G.hands[id] ?? []) {
      deltas[id] = (deltas[id] ?? 0) - cardValue(card);
    }
  }

  return { roundNumber: G.roundNumber, closedBy, deltas };
}
