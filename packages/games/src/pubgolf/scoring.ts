import type { PlayerID, PubgolfState } from "./types";

/** A player's computed golf standing for the night. Lower `total` is better. */
export interface Standing {
  playerID: PlayerID;
  /** Sum over played bars of `sips - par` (a hole's par defaults to 0). */
  holeTotal: number;
  /** Sum of challenge adjustments. */
  challengeTotal: number;
  /** Sum of rule-penalty deltas (excludes DISK rules). */
  penaltyTotal: number;
  /** holeTotal + challengeTotal + penaltyTotal. */
  total: number;
  disqualified: boolean;
  /** Number of bars where sips were recorded. */
  holesPlayed: number;
}

/** Compute a single player's standing from the current state. */
export function computeStanding(G: PubgolfState, playerID: PlayerID): Standing {
  let holeTotal = 0;
  let challengeTotal = 0;
  let holesPlayed = 0;

  for (const stop of G.stops) {
    if (stop.type !== "bar") continue;
    const cell = G.scores[stop.id]?.[playerID];
    if (!cell) continue;
    if (typeof cell.sips === "number") {
      holeTotal += cell.sips - (stop.par ?? 0);
      holesPlayed += 1;
    }
    if (typeof cell.challengeDelta === "number") {
      challengeTotal += cell.challengeDelta;
    }
  }

  let penaltyTotal = 0;
  let disqualified = false;
  for (const pen of G.penalties) {
    if (pen.playerID !== playerID) continue;
    if (pen.disqualifies) disqualified = true;
    else penaltyTotal += pen.delta;
  }

  return {
    playerID,
    holeTotal,
    challengeTotal,
    penaltyTotal,
    total: holeTotal + challengeTotal + penaltyTotal,
    disqualified,
    holesPlayed,
  };
}

/**
 * Standings for a set of players, ranked best-first: lowest total wins (golf),
 * disqualified players sink to the bottom.
 */
export function computeStandings(
  G: PubgolfState,
  playerIDs: PlayerID[]
): Standing[] {
  return playerIDs
    .map((id) => computeStanding(G, id))
    .sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return a.total - b.total;
    });
}

/** Total each player has paid into the shared ledger. */
export function paymentTotals(G: PubgolfState): Record<PlayerID, number> {
  const totals: Record<PlayerID, number> = {};
  for (const pay of G.payments) {
    totals[pay.payerId] = (totals[pay.payerId] ?? 0) + pay.amount;
  }
  return totals;
}
