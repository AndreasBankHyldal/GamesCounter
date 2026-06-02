import type { Game } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { buildDeck, formatCard, type Card } from "../cards";
import {
  jokerRepresents,
  validateExtend,
  validateNewMeld,
} from "./melds";
import { scoreRound } from "./scoring";
import type { Declaration, FiveHundredState, PlayerID } from "./types";

export const WIN_SCORE = 500;
const HAND_SIZE = 7;
const PILE_PENALTY = 50;

type Shuffle = <T>(items: T[]) => T[];

/** Deal a fresh round: 7 cards each, one card flipped face-up, rest face-down. */
function dealRound(playerIDs: PlayerID[], shuffle: Shuffle) {
  const deck = shuffle(buildDeck());
  const hands: Record<PlayerID, Card[]> = {};
  let i = 0;
  for (const id of playerIDs) {
    hands[id] = deck.slice(i, i + HAND_SIZE);
    i += HAND_SIZE;
  }
  const faceUp = [deck[i]];
  const stock = deck.slice(i + 1);
  return { hands, stock, faceUp };
}

function tag(playerID: PlayerID) {
  return `P${Number(playerID) + 1}`;
}

export const FiveHundred: Game<FiveHundredState> = {
  name: "five-hundred",
  minPlayers: 2,
  maxPlayers: 6,

  setup: ({ ctx, random }) => {
    const playerIDs = ctx.playOrder;
    const { hands, stock, faceUp } = dealRound(playerIDs, (a) => random.Shuffle(a));
    const scores: Record<PlayerID, number> = Object.fromEntries(
      playerIDs.map((id) => [id, 0])
    );
    return {
      stock,
      faceUp,
      hands,
      melds: [],
      scores,
      roundNumber: 1,
      closedBy: null,
      finished: false,
      lastRound: null,
      // "Youngest player goes first" — we have no birthdates, so seat 0 (the
      // host / first to join) leads. boardgame.io's default turn order starts
      // at playOrder[0] and proceeds in join order.
      log: ["Round 1 dealt."],
      hasDrawn: false,
      tookPile: false,
      mustMeld: false,
      meldedThisTurn: false,
    };
  },

  turn: {
    onBegin: ({ G }) => {
      G.hasDrawn = false;
      G.tookPile = false;
      G.mustMeld = false;
      G.meldedThisTurn = false;
    },
  },

  moves: {
    // ---- Draw phase (exactly one of these per turn) ----
    drawFromStock: ({ G, playerID, random }) => {
      if (G.hasDrawn) return INVALID_MOVE;
      if (G.stock.length === 0) {
        // Stock empty: reshuffle the face-up pile (keeping its top) into a new
        // face-down stock.
        if (G.faceUp.length <= 1) return INVALID_MOVE;
        const top = G.faceUp[G.faceUp.length - 1];
        G.stock = random.Shuffle(G.faceUp.slice(0, -1));
        G.faceUp = [top];
      }
      const card = G.stock.pop()!;
      G.hands[playerID].push(card);
      G.hasDrawn = true;
      G.log.push(`${tag(playerID)} drew from the deck.`);
    },

    drawFromFaceUp: ({ G, playerID }) => {
      if (G.hasDrawn) return INVALID_MOVE;
      if (G.faceUp.length === 0) return INVALID_MOVE;
      const card = G.faceUp.pop()!;
      G.hands[playerID].push(card);
      G.hasDrawn = true;
      G.log.push(`${tag(playerID)} took ${formatCard(card)} from the pile.`);
    },

    takeFaceUpPile: ({ G, playerID }) => {
      if (G.hasDrawn) return INVALID_MOVE;
      // First-round restriction: cannot take the whole face-up pile.
      if (G.roundNumber === 1) return INVALID_MOVE;
      if (G.faceUp.length === 0) return INVALID_MOVE;
      G.hands[playerID].push(...G.faceUp);
      G.faceUp = [];
      G.hasDrawn = true;
      G.tookPile = true;
      G.mustMeld = true; // owes a meld this turn, or −50 at discard
      G.log.push(`${tag(playerID)} took the entire pile.`);
    },

    // ---- Meld phase (optional, any number per turn after drawing) ----
    playMeld: (
      { G, playerID },
      cardIds: string[],
      declarations: Declaration[] = []
    ) => {
      if (!G.hasDrawn) return INVALID_MOVE;
      const hand = G.hands[playerID];
      const cards = cardIds
        .map((id) => hand.find((c) => c.id === id))
        .filter((c): c is Card => Boolean(c));
      if (cards.length !== cardIds.length) return INVALID_MOVE;

      const meldId = `meld-${G.roundNumber}-${G.melds.length}-${cardIds[0]}`;
      const res = validateNewMeld(cards, declarations, playerID, meldId);
      if (!res.ok || !res.meld) return INVALID_MOVE;

      G.hands[playerID] = hand.filter((c) => !cardIds.includes(c.id));
      G.melds.push(res.meld);
      G.mustMeld = false;
      G.meldedThisTurn = true;
      G.log.push(
        `${tag(playerID)} melded ${res.meld.cards.map((c) => formatCard(c.card)).join(" ")}.`
      );
    },

    extendMeld: (
      { G, playerID },
      meldId: string,
      cardIds: string[],
      declarations: Declaration[] = []
    ) => {
      if (!G.hasDrawn) return INVALID_MOVE;
      const meld = G.melds.find((m) => m.id === meldId);
      if (!meld) return INVALID_MOVE;
      const hand = G.hands[playerID];
      const cards = cardIds
        .map((id) => hand.find((c) => c.id === id))
        .filter((c): c is Card => Boolean(c));
      if (cards.length !== cardIds.length) return INVALID_MOVE;

      const res = validateExtend(meld, cards, declarations, playerID);
      if (!res.ok || !res.cards) return INVALID_MOVE;

      meld.cards = res.cards;
      G.hands[playerID] = hand.filter((c) => !cardIds.includes(c.id));
      G.mustMeld = false;
      G.meldedThisTurn = true;
      G.log.push(`${tag(playerID)} extended a ${meld.suit} run.`);
    },

    // ---- Joker swap (on your turn, if you hold the represented real card) ----
    swapJoker: ({ G, playerID }, meldId: string, placedIndex: number) => {
      const meld = G.melds.find((m) => m.id === meldId);
      if (!meld) return INVALID_MOVE;
      const placed = meld.cards[placedIndex];
      if (!placed || !placed.card.isJoker) return INVALID_MOVE;

      const { suit, rank } = jokerRepresents(placed);
      const hand = G.hands[playerID];
      const real = hand.find((c) => !c.isJoker && c.suit === suit && c.rank === rank);
      if (!real) return INVALID_MOVE;

      const joker = placed.card;
      meld.cards[placedIndex] = {
        card: real,
        placedBy: playerID,
        asRank: placed.asRank,
        asSuit: placed.asSuit,
      };
      G.hands[playerID] = hand.filter((c) => c.id !== real.id).concat(joker);
      G.log.push(`${tag(playerID)} swapped a real card for a joker.`);
    },

    // ---- Discard phase (ends the turn) ----
    discard: ({ G, ctx, playerID, events, random }, cardId: string, faceDown = false) => {
      if (!G.hasDrawn) return INVALID_MOVE;
      const hand = G.hands[playerID];
      const card = hand.find((c) => c.id === cardId);
      if (!card) return INVALID_MOVE;
      // Closing means discarding your LAST card face-down.
      if (faceDown && hand.length !== 1) return INVALID_MOVE;
      // First-round restriction: cannot close the game.
      if (faceDown && G.roundNumber === 1) return INVALID_MOVE;

      // Penalty for taking the pile without ever melding.
      if (G.mustMeld && !G.meldedThisTurn) {
        G.scores[playerID] -= PILE_PENALTY;
        G.mustMeld = false;
        G.log.push(`${tag(playerID)} took the pile without melding (−${PILE_PENALTY}).`);
      }

      G.hands[playerID] = hand.filter((c) => c.id !== cardId);

      if (faceDown) {
        G.closedBy = playerID;
        const result = scoreRound(G, ctx.playOrder, playerID);
        for (const id of ctx.playOrder) G.scores[id] += result.deltas[id] ?? 0;
        G.lastRound = result;
        G.log.push(`${tag(playerID)} closed round ${G.roundNumber}.`);

        const winner = ctx.playOrder.find((id) => G.scores[id] >= WIN_SCORE);
        if (winner !== undefined) {
          G.finished = true;
          G.log.push(`${tag(winner)} reached ${WIN_SCORE} — game over.`);
          return; // endIf ends the game
        }

        // No winner yet: deal the next round and pass to the next player.
        G.roundNumber += 1;
        const next = dealRound(ctx.playOrder, (a) => random.Shuffle(a));
        G.hands = next.hands;
        G.stock = next.stock;
        G.faceUp = next.faceUp;
        G.melds = [];
        G.closedBy = null;
        G.log.push(`Round ${G.roundNumber} dealt.`);
        events.endTurn();
        return;
      }

      // Normal face-up discard: pile stays open, next player's turn.
      G.faceUp.push(card);
      G.log.push(`${tag(playerID)} discarded ${formatCard(card)}.`);
      events.endTurn();
    },
  },

  endIf: ({ G, ctx }) => {
    if (!G.finished) return;
    let winner = ctx.playOrder[0];
    for (const id of ctx.playOrder) {
      if (G.scores[id] > G.scores[winner]) winner = id;
    }
    return { winner, scores: G.scores };
  },

  // Hide secret state from each client: other players' hands and the face-down
  // stock contents. Counts are exposed so the UI can render card backs.
  playerView: ({ G, playerID }) => {
    const hands: Record<PlayerID, Card[]> = {};
    const handCounts: Record<PlayerID, number> = {};
    for (const id of Object.keys(G.hands)) {
      handCounts[id] = G.hands[id].length;
      hands[id] = id === playerID ? G.hands[id] : [];
    }
    return {
      ...G,
      stock: [],
      stockCount: G.stock.length,
      hands,
      handCounts,
    };
  },
};
