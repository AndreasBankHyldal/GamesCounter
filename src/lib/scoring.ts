import type { Player } from "./players";

export interface Round {
  id: string;
  /** Points entered per player id for this round. Missing = not entered (0). */
  scores: Record<string, number>;
}

export function makeRound(scores: Record<string, number> = {}): Round {
  return { id: Math.random().toString(36).slice(2), scores };
}

export interface Standings {
  totals: Record<string, number>;
  finished: boolean;
  winnerIds: string[];
  loserIds: string[];
}

export const PIRATE_DECK = 52;

/** Cards dealt to each player in the first Pirate Bridge round. */
export function pirateStartCards(playerCount: number): number {
  return Math.max(1, Math.floor(PIRATE_DECK / Math.max(1, playerCount)));
}

/**
 * Cards to deal and who deals for a given Pirate Bridge round index (0-based).
 * `totalRounds` is the game's round count (= its starting card count), which
 * may be lower than the deck default for a shorter match.
 */
export function pirateRoundInfo(
  players: Player[],
  roundIndex: number,
  totalRounds: number
) {
  const cards = totalRounds - roundIndex;
  const dealer = players[roundIndex % players.length];
  return { cards, dealer };
}

/** Whether a value triggers the Gabong exact-hundred halving. */
function isExactHundred(value: number): boolean {
  return value > 0 && value % 100 === 0;
}

export interface HundredHit {
  playerId: string;
  landedOn: number;
  halvedTo: number;
}

/**
 * Players who land exactly on a multiple of 100 (and get halved) when the
 * given round's scores are applied on top of the rounds before it.
 * `priorRounds` is everything before the round being entered/edited.
 */
export function gabongHundredHits(
  players: Player[],
  priorRounds: Round[],
  roundScores: Record<string, number>
): HundredHit[] {
  const prior = computeStandings("gabong", players, priorRounds).totals;
  const hits: HundredHit[] = [];
  for (const p of players) {
    const landedOn = (prior[p.id] ?? 0) + (roundScores[p.id] ?? 0);
    if (isExactHundred(landedOn)) {
      hits.push({ playerId: p.id, landedOn, halvedTo: landedOn / 2 });
    }
  }
  return hits;
}

export function computeStandings(
  slug: string,
  players: Player[],
  rounds: Round[]
): Standings {
  const ids = players.map((p) => p.id);
  const totals: Record<string, number> = Object.fromEntries(
    ids.map((id) => [id, 0])
  );

  if (slug === "gabong") {
    const loserIds: string[] = [];
    let finished = false;
    for (const round of rounds) {
      for (const id of ids) {
        let total = totals[id] + (round.scores[id] ?? 0);
        if (isExactHundred(total)) total = total / 2; // halve once
        totals[id] = total;
        if (total >= 500) {
          finished = true;
          if (!loserIds.includes(id)) loserIds.push(id);
        }
      }
      if (finished) break;
    }
    return { totals, finished, winnerIds: [], loserIds };
  }

  // 500 and Pirate Bridge: totals are simple sums.
  for (const round of rounds) {
    for (const id of ids) totals[id] += round.scores[id] ?? 0;
  }

  if (slug === "500") {
    // A round counts once every player has had a turn; check after each round.
    const running: Record<string, number> = Object.fromEntries(
      ids.map((id) => [id, 0])
    );
    for (const round of rounds) {
      for (const id of ids) running[id] += round.scores[id] ?? 0;
      const reached = ids.filter((id) => running[id] >= 500);
      if (reached.length > 0) {
        return { totals, finished: true, winnerIds: reached, loserIds: [] };
      }
    }
    return { totals, finished: false, winnerIds: [], loserIds: [] };
  }

  // piratbridge — highest total leads; finishing is decided by the session
  // (all scheduled rounds filled in).
  let winnerIds: string[] = [];
  if (rounds.length > 0) {
    const max = Math.max(...ids.map((id) => totals[id]));
    winnerIds = ids.filter((id) => totals[id] === max);
  }
  return { totals, finished: false, winnerIds, loserIds: [] };
}
