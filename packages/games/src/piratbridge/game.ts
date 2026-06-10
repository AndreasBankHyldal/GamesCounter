import type { Game, MoveFn } from "boardgame.io";
import { INVALID_MOVE, Stage } from "boardgame.io/core";
import { buildDeck, formatCard, type Card } from "../cards";
import { scoreRound } from "./scoring";
import type {
  PiratbridgeSetupData,
  PiratbridgeState,
  PlayerID,
  RoundResult,
  TrickCard,
} from "./types";

function tag(pid: PlayerID): string {
  return `@@${pid}@@`;
}

/** Resolve the winner of a completed trick. Ace = rank 14 (high). */
function evaluateTrick(trick: TrickCard[]): PlayerID {
  const leadSuit = trick[0].card.suit!;
  const trumps = trick.filter((t) => t.card.suit === "spade");
  const candidates =
    trumps.length > 0
      ? trumps
      : trick.filter((t) => t.card.suit === leadSuit);
  const effectiveRank = (c: Card) => (c.rank === 1 ? 14 : c.rank);
  return candidates.reduce((best, t) =>
    effectiveRank(t.card) > effectiveRank(best.card) ? t : best
  ).playerID;
}

/** Apply round scoring and push history. Sets G.phase to "roundOver" or "gameOver". */
function settleRound(G: PiratbridgeState, playOrder: PlayerID[]): void {
  const bets = G.bets as Record<PlayerID, number>;
  const deltas = scoreRound(bets, G.tricksWon);
  for (const pid of playOrder) {
    G.scores[pid] = (G.scores[pid] ?? 0) + (deltas[pid] ?? 0);
  }
  const result: RoundResult = {
    roundNumber: G.roundNumber,
    cardsDealt: G.cardsThisRound,
    bets,
    tricksWon: { ...G.tricksWon },
    deltas,
    cumulativeScores: { ...G.scores },
  };
  G.roundHistory.push(result);
  G.lastRound = result;
  G.phase = G.cardsThisRound === 1 ? "gameOver" : "roundOver";
}

// ─── Moves ───────────────────────────────────────────────────────────────────

const placeBet: MoveFn<PiratbridgeState> = ({ G, playerID }, amount: number) => {
  if (G.phase !== "betting") return INVALID_MOVE;
  if (G.bets[playerID!] !== null) return INVALID_MOVE; // already bet
  if (!Number.isInteger(amount) || amount < 0) return INVALID_MOVE;
  G.bets[playerID!] = amount;
  G.log.push(`${tag(playerID!)} placed a bet.`);
  if (Object.values(G.bets).every((b) => b !== null)) {
    G.betsRevealed = true;
    G.log.push("All bets placed — revealing!");
  }
};

const playCard: MoveFn<PiratbridgeState> = (
  { G, ctx, playerID, events },
  cardId: string
) => {
  if (G.phase !== "playing") return INVALID_MOVE;
  if (playerID !== ctx.currentPlayer) return INVALID_MOVE;

  const hand = G.hands[playerID];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return INVALID_MOVE;

  // Must follow the lead suit if possible.
  if (G.leadSuit !== null && card.suit !== G.leadSuit) {
    if (hand.some((c) => c.suit === G.leadSuit)) return INVALID_MOVE;
  }

  // First card in trick sets the lead suit.
  if (G.currentTrick.length === 0) {
    G.leadSuit = card.suit as string;
  }

  G.currentTrick.push({ playerID, card });
  G.hands[playerID] = hand.filter((c) => c.id !== cardId);
  G.log.push(`${tag(playerID)} played ${formatCard(card)}.`);

  if (G.currentTrick.length === ctx.numPlayers) {
    // Trick complete — find the winner.
    const winnerId = evaluateTrick(G.currentTrick);
    G.tricksWon[winnerId] = (G.tricksWon[winnerId] ?? 0) + 1;
    G.trickCount += 1;
    G.trickLeader = winnerId;
    G.log.push(`${tag(winnerId)} won trick ${G.trickCount}.`);
    // Keep the finished trick on the table until the winner leads the next one.
    G.lastTrick = { cards: G.currentTrick, winnerID: winnerId };
    G.currentTrick = [];
    G.leadSuit = null;

    if (G.trickCount === G.cardsThisRound) {
      // All tricks played — score and end round.
      // settleRound sets G.phase to "roundOver" or "gameOver".
      const wasLastRound = G.cardsThisRound === 1;
      settleRound(G, ctx.playOrder);
      if (!wasLastRound) {
        // Seat 0 (host) advances to the next round.
        events.endTurn({ next: "0" });
      }
      return;
    }
  }

  events.endTurn();
};

const nextRoundMove: MoveFn<PiratbridgeState> = ({
  G,
  ctx,
  playerID,
  random,
  events,
}) => {
  if (G.phase !== "roundOver") return INVALID_MOVE;
  if (playerID !== "0") return INVALID_MOVE;

  const newCardsCount = G.cardsThisRound - 1;
  const newDealerSeat = (G.dealerSeat + 1) % ctx.numPlayers;
  const newTrickLeader = String((newDealerSeat + 1) % ctx.numPlayers);

  const deck = random.Shuffle(buildDeck(0));
  const hands: Record<PlayerID, Card[]> = {};
  for (let i = 0; i < ctx.numPlayers; i++) {
    hands[String(i)] = deck.splice(0, newCardsCount);
  }

  G.hands = hands;
  G.spareCards = deck;
  G.bets = Object.fromEntries(ctx.playOrder.map((pid) => [pid, null]));
  G.betsRevealed = false;
  G.currentTrick = [];
  G.lastTrick = null;
  G.leadSuit = null;
  G.trickLeader = newTrickLeader;
  G.trickCount = 0;
  G.tricksWon = Object.fromEntries(ctx.playOrder.map((pid) => [pid, 0]));
  G.dealerSeat = newDealerSeat;
  G.roundNumber += 1;
  G.cardsThisRound = newCardsCount;
  G.phase = "betting";
  G.log.push(`Round ${G.roundNumber} — ${newCardsCount} card${newCardsCount !== 1 ? "s" : ""} dealt.`);

  events.endPhase(); // → back to "betting" phase
};

// ─── Game ─────────────────────────────────────────────────────────────────────

export const Piratbridge: Game<
  PiratbridgeState,
  Record<string, unknown>,
  PiratbridgeSetupData
> = {
  name: "piratbridge",
  minPlayers: 2,
  maxPlayers: 6,

  setup: ({ ctx, random }, setupData) => {
    const numPlayers = ctx.numPlayers;
    const maxCards = Math.floor(52 / numPlayers);
    const startingCards = Math.max(
      1,
      Math.min(maxCards, setupData?.startingCards ?? maxCards)
    );
    const openFinalRound = setupData?.openFinalRound ?? false;

    const deck = random.Shuffle(buildDeck(0)); // No jokers in Piratbridge
    const hands: Record<PlayerID, Card[]> = {};
    for (let i = 0; i < numPlayers; i++) {
      hands[String(i)] = deck.splice(0, startingCards);
    }

    const playerIDs = ctx.playOrder;
    return {
      hands,
      spareCards: deck,
      bets: Object.fromEntries(playerIDs.map((pid) => [pid, null])),
      betsRevealed: false,
      currentTrick: [],
      lastTrick: null,
      leadSuit: null,
      trickLeader: String(1 % numPlayers), // Player after dealer (seat 0)
      trickCount: 0,
      tricksWon: Object.fromEntries(playerIDs.map((pid) => [pid, 0])),
      scores: Object.fromEntries(playerIDs.map((pid) => [pid, 0])),
      roundHistory: [],
      lastRound: null,
      roundNumber: 1,
      cardsThisRound: startingCards,
      dealerSeat: 0,
      startingCards,
      openFinalRound,
      phase: "betting",
      log: ["Cards dealt — place your bets!"],
    };
  },

  phases: {
    betting: {
      start: true,
      // All players can simultaneously call placeBet (Stage.NULL = unrestricted
      // within this phase's move list).
      turn: {
        activePlayers: { all: Stage.NULL },
      },
      moves: { placeBet },
      // Auto-end phase once every player has submitted their bet.
      endIf: ({ G }) => G.betsRevealed || undefined,
      onEnd: ({ G }) => {
        G.phase = "playing";
      },
      next: "playing",
    },

    playing: {
      turn: {
        // Each trick starts with the trickLeader. Within a trick, players advance
        // clockwise. After the last card, the winner leads the next trick.
        order: {
          first: ({ G, ctx }: { G: PiratbridgeState; ctx: { playOrder: string[] } }) =>
            ctx.playOrder.indexOf(G.trickLeader),
          next: ({
            G,
            ctx,
          }: {
            G: PiratbridgeState;
            ctx: { playOrder: string[]; playOrderPos: number; numPlayers: number };
          }) => {
            // currentTrick was just reset → new trick, winner leads.
            if (G.currentTrick.length === 0) {
              return ctx.playOrder.indexOf(G.trickLeader);
            }
            return (ctx.playOrderPos + 1) % ctx.numPlayers;
          },
        },
      },
      moves: {
        playCard,
        nextRound: {
          client: false, // Shuffles a new deck — must run server-side only.
          move: nextRoundMove,
        },
      },
      // nextRound ends this phase with events.endPhase(); without an explicit
      // next, boardgame.io would drop into the null phase where placeBet isn't
      // a move — bets in round 2+ were silently rejected.
      next: "betting",
    },
  },

  playerView: ({ G, playerID }) => {
    // A client connected under the wrong game name routes another game's
    // state through here; an empty view beats crashing the whole server.
    if (!G?.hands || !G?.bets) return {} as PiratbridgeState;
    // Open final round: everyone's card is revealed BEFORE betting — players
    // bet knowing every card except their own (the UI keeps one's own card
    // face-down). So the reveal must include the betting phase.
    const isOpenFinal = G.openFinalRound && G.cardsThisRound === 1;

    const handCounts: Record<PlayerID, number> = {};
    const hands: Record<PlayerID, Card[]> = {};

    for (const [pid, hand] of Object.entries(G.hands)) {
      handCounts[pid] = hand.length;
      if (pid === playerID) {
        // Own hand: always sent to client (UI hides value in open final round).
        hands[pid] = hand;
      } else {
        // Opponents: visible only in open final round, otherwise face-down (empty).
        hands[pid] = isOpenFinal ? hand : [];
      }
    }

    // Redact unrevealed bets: -1 = "has bet, value hidden".
    const bets: Record<PlayerID, number | null> = {};
    for (const [pid, bet] of Object.entries(G.bets)) {
      bets[pid] =
        !G.betsRevealed && pid !== playerID && bet !== null ? -1 : bet;
    }

    return { ...G, hands, handCounts, bets };
  },

  endIf: ({ G }) => {
    if (G.phase === "gameOver") {
      const winner = Object.entries(G.scores).sort(([, a], [, b]) => b - a)[0][0];
      return { winner };
    }
  },
};
