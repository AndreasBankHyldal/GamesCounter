import type { PlayerID } from "./types";

/**
 * Score a round of Piratbridge.
 * Correct guess (bet === won): +5 + bet
 * Wrong guess: -|bet - won|
 */
export function scoreRound(
  bets: Record<PlayerID, number>,
  tricksWon: Record<PlayerID, number>
): Record<PlayerID, number> {
  return Object.fromEntries(
    Object.keys(bets).map((pid) => {
      const bet = bets[pid];
      const won = tricksWon[pid] ?? 0;
      const delta = bet === won ? 5 + bet : -Math.abs(bet - won);
      return [pid, delta];
    })
  );
}
