import type { PlayerID } from "./types";

/**
 * Score a round of Piratbridge.
 * Correct guess (bet === won): +correctBase + bet
 * Wrong guess: -|bet - won|
 *
 * `correctBase` is 5 for normal rounds and 10 for the final (1-card) round,
 * so a correct final-round guess pays +10 (bet 0) or +11 (bet 1), while a
 * wrong guess still costs the usual -1.
 */
export function scoreRound(
  bets: Record<PlayerID, number>,
  tricksWon: Record<PlayerID, number>,
  correctBase: number = 5
): Record<PlayerID, number> {
  return Object.fromEntries(
    Object.keys(bets).map((pid) => {
      const bet = bets[pid];
      const won = tricksWon[pid] ?? 0;
      const delta = bet === won ? correctBase + bet : -Math.abs(bet - won);
      return [pid, delta];
    })
  );
}
