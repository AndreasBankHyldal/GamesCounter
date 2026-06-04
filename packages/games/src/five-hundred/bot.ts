import { cardValue, type Card } from "../cards";
import { meldingOpen } from "./game";
import { validateExtend, validateNewMeld } from "./melds";
import type { FiveHundredState, Meld, PlayerID } from "./types";

type AiMove = { move: string; args?: unknown[] };

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [
    ...combinations(tail, k - 1).map((c) => [head, ...c]),
    ...combinations(tail, k),
  ];
}

/** Find the longest valid same-suit run per suit in the hand (no jokers). */
function findValidMelds(hand: Card[]): AiMove[] {
  const moves: AiMove[] = [];
  const bySuit: Record<string, Card[]> = {};
  for (const card of hand.filter((c) => !c.isJoker)) {
    bySuit[card.suit!] ??= [];
    bySuit[card.suit!].push(card);
  }
  for (const suitCards of Object.values(bySuit)) {
    if (suitCards.length < 3) continue;
    // Prefer longer melds — try from largest subset down
    outer: for (let k = suitCards.length; k >= 3; k--) {
      for (const combo of combinations(suitCards, k)) {
        if (validateNewMeld(combo, [], "_bot", "probe").ok) {
          moves.push({ move: "playMeld", args: [combo.map((c) => c.id)] });
          break outer;
        }
      }
    }
  }
  return moves;
}

function findValidExtensions(
  hand: Card[],
  melds: Meld[],
  playerID: PlayerID
): AiMove[] {
  const moves: AiMove[] = [];
  for (const meld of melds) {
    for (const card of hand.filter((c) => !c.isJoker && c.suit === meld.suit)) {
      if (validateExtend(meld, [card], [], playerID).ok) {
        moves.push({ move: "extendMeld", args: [meld.id, [card.id]] });
      }
    }
  }
  return moves;
}

/**
 * Enumerate valid moves for the bot (player "1") in a strategic order.
 * RandomBot picks randomly from this list, so restricting options shapes behaviour:
 *  - draw phase: prefer stock; take pile only when melding is open and it's large
 *  - meld phase: meld everything possible before discarding (once melding is open)
 *  - discard phase: discard among the 3 highest-value cards (some variety)
 *
 * Melding/extending/taking-the-pile is locked until every player has had a turn
 * (`meldingOpen`), so those moves must be gated — RandomBot can't recover from an
 * INVALID_MOVE, which would otherwise stall the bot's turn.
 */
export function enumerate(
  G: FiveHundredState,
  ctx: { currentPlayer: string; numPlayers: number },
  playerID: string
): AiMove[] {
  // Guard against race condition in boardgame.io's subscribe mechanism where
  // the bot may be called on a stale state after its turn has already ended.
  if (ctx.currentPlayer !== playerID) return [];

  if (G.finished) return [];

  // Round-over: only player "0" (human) calls nextRound — bot waits.
  if (G.roundOver) return [];

  // Safety: if hand is missing entirely this state snapshot is unusable.
  if (!G.hands[playerID]) return [];

  const hand = G.hands[playerID] ?? [];
  const canMeld = meldingOpen(G.turnsThisRound, ctx.numPlayers);

  if (!G.hasDrawn) {
    const moves: AiMove[] = [];
    // Draw from stock is always safe (reshuffles face-up pile if needed).
    if (G.stock.length > 0 || G.faceUp.length > 1) {
      moves.push({ move: "drawFromStock" });
    }
    if (G.faceUp.length > 0) {
      moves.push({ move: "drawFromFaceUp" });
      // Taking the whole pile is only legal (and worthwhile) once melding is open
      // and the pile is large enough to justify the meld obligation.
      if (canMeld && G.faceUp.length >= 4) moves.push({ move: "takeFaceUpPile" });
    }
    return moves.length > 0 ? moves : [{ move: "drawFromStock" }];
  }

  if (hand.length === 0) return [{ move: "passTurn" }];
  if (hand.length === 1) return [{ move: "closeHand", args: [hand[0].id] }];

  // If any meld/extend is possible (and melding is open), return only those — the
  // bot keeps melding until it can't, then falls through to discard.
  const meldMoves = canMeld
    ? [
        ...findValidMelds(hand),
        ...findValidExtensions(hand, G.melds, playerID),
      ]
    : [];
  if (meldMoves.length > 0) return meldMoves;

  // No melds left: discard among the 3 highest-value cards for variety.
  const top3 = [...hand]
    .sort((a, b) => cardValue(b) - cardValue(a))
    .slice(0, Math.min(3, hand.length));
  return top3.map((card) => ({ move: "discard", args: [card.id] }));
}
