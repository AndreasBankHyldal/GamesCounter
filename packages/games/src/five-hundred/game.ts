import type { Game, MoveFn } from "boardgame.io";
import { INVALID_MOVE, Stage } from "boardgame.io/core";
import { buildDeck, type Card } from "../cards";
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
function dealRound(playerIDs: PlayerID[], shuffle: Shuffle, jokers: number) {
  const deck = shuffle(buildDeck(jokers));
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

/** Player reference token; the client swaps `@@<id>@@` for the display name. */
function tag(playerID: PlayerID) {
  return `@@${playerID}@@`;
}

/**
 * Whether laying down / extending melds (and taking the whole pile) is allowed
 * yet: only once every player has had a turn in the current hand.
 */
export function meldingOpen(turnsThisRound: number, numPlayers: number): boolean {
  return turnsThisRound > numPlayers;
}

/** Match-creation options chosen by the host. */
export interface FiveHundredSetupData {
  jokers?: number;
  winningScore?: number;
}

/**
 * Tally a round (melds score for their placers, cards left in hand score
 * against their holders), record the result, and decide what comes next.
 * Returns the seat that should start the next round, or `null` if someone
 * reached the winning score and the game is over. Shared by `closeHand` and the
 * deck-exhausted auto-end in `turn.onBegin`. `closedBy` is null when the round
 * ended because no cards were left to draw (no closer).
 */
function settleRound(
  G: FiveHundredState,
  playOrder: PlayerID[],
  closedBy: PlayerID | null
): PlayerID | null {
  const result = scoreRound(G, playOrder, closedBy);
  for (const id of playOrder) G.scores[id] += result.deltas[id] ?? 0;
  G.lastRound = result;
  G.closedBy = closedBy;
  if (playOrder.some((id) => G.scores[id] >= G.winningScore)) {
    G.finished = true;
    G.log.push(`Someone reached ${G.winningScore} — game over.`);
    return null;
  }
  G.roundOver = true;
  // Start the next round with the first present player, so a departed host
  // can't stall the round-over screen.
  return playOrder.find((id) => !G.left[id]) ?? "0";
}

// Host (seat 0) deals the next round; the first player rotates each round. Also
// callable from the `spectate` stage so any present player can advance the round
// if the rotated starter has left. Declared at module scope (hoisted) so the
// `turn.stages` config below can reference it.
const nextRound: MoveFn<FiveHundredState> = ({ G, ctx, random, events }) => {
  if (!G.roundOver || G.finished) return INVALID_MOVE;
  // Deal only to players still in the game; those who left stay as standbys
  // with an empty hand (no cards, score frozen).
  const present = Object.keys(G.hands).filter((id) => !G.left[id]);
  const next = dealRound(present, (a) => random.Shuffle(a), G.jokers);
  G.hands = Object.fromEntries(
    Object.keys(G.hands).map((id) => [id, next.hands[id] ?? []])
  );
  G.stock = next.stock;
  G.faceUp = next.faceUp;
  G.melds = [];
  G.closingCard = null;
  G.closedBy = null;
  G.roundOver = false;
  G.lastRound = null;
  G.roundNumber += 1;
  G.turnsThisRound = 0; // melding is closed again until everyone has played
  G.log.push(`Round ${G.roundNumber} dealt.`);
  // Rotate who leads: round 1 → seat 0, round 2 → seat 1, … (a left starter is
  // auto-skipped in turn.onBegin).
  const starter = String((G.roundNumber - 1) % ctx.numPlayers);
  events.endTurn({ next: starter });
};

// Leave the game. Callable from any seat (it's in the `spectate` stage too), so
// a player can quit whether or not it's their turn. Their turns are then
// auto-skipped in turn.onBegin; cards left in hand still count against them.
const leaveGame: MoveFn<FiveHundredState> = ({ G, ctx, playerID, events }) => {
  if (G.finished) return INVALID_MOVE;
  const pid = playerID!;
  if (G.left[pid]) return; // already left — no-op
  G.left[pid] = true;
  // Become a frozen standby: drop their hand so the current round's close
  // doesn't penalise held cards, and they're dealt nothing from now on. Their
  // cumulative score (and any melds they already placed) stays as-is.
  G.hands[pid] = [];
  G.log.push(`${tag(pid)} left the game.`);
  if (ctx.playOrder.every((id) => G.left[id])) {
    // No one left to play — end the game.
    G.finished = true;
    G.log.push("Everyone left — game over.");
    return;
  }
  // If the leaver is the current player mid-round, pass the turn along now so
  // the game doesn't wait on someone who's gone.
  if (ctx.currentPlayer === pid && !G.roundOver) {
    events.endTurn();
  }
};

export const FiveHundred: Game<
  FiveHundredState,
  Record<string, unknown>,
  FiveHundredSetupData
> = {
  name: "five-hundred",
  minPlayers: 2,
  maxPlayers: 6,

  setup: ({ ctx, random }, setupData) => {
    const playerIDs = ctx.playOrder;
    // Host picks the joker count (0–4) when creating the match; default 2.
    const jokers = Math.max(0, Math.min(4, Math.floor(setupData?.jokers ?? 2)));
    // Host picks the winning score (100–1000, in hundreds); default 500.
    const winningScore =
      Math.max(1, Math.min(10, Math.round((setupData?.winningScore ?? WIN_SCORE) / 100))) * 100;
    const { hands, stock, faceUp } = dealRound(playerIDs, (a) => random.Shuffle(a), jokers);
    const scores: Record<PlayerID, number> = Object.fromEntries(
      playerIDs.map((id) => [id, 0])
    );
    return {
      stock,
      faceUp,
      hands,
      melds: [],
      scores,
      left: {},
      jokers,
      winningScore,
      roundNumber: 1,
      turnsThisRound: 0,
      closedBy: null,
      closingCard: null,
      roundOver: false,
      finished: false,
      lastRound: null,
      lastDrawnId: null,
      // "Youngest player goes first" — we have no birthdates, so seat 0 (the
      // host / first to join) leads. boardgame.io's default turn order starts
      // at playOrder[0] and proceeds in join order.
      log: ["The cards are dealt."],
      hasDrawn: false,
      tookPile: false,
      mustMeld: false,
      meldedThisTurn: false,
    };
  },

  turn: {
    // Everyone is kept "active" every turn so the `leaveGame` (and the
    // round-over `nextRound`) move can be sent from any seat, not just the
    // current player. The current player sits in the null stage (top-level
    // `moves` apply); everyone else is limited to the `spectate` stage moves.
    activePlayers: { currentPlayer: Stage.NULL, others: "spectate" },
    stages: {
      spectate: { moves: { leaveGame, nextRound } },
    },
    onBegin: ({ G, ctx, events }) => {
      G.hasDrawn = false;
      G.tookPile = false;
      G.mustMeld = false;
      G.meldedThisTurn = false;
      G.lastDrawnId = null;
      G.turnsThisRound += 1;
      // Deck AND pile both empty → nobody can draw, so the round can't continue
      // (every action requires drawing first). End it here, scoring hands as
      // they stand with no closer, so play doesn't deadlock. Runs
      // server-authoritatively as part of the previous player's turn-end.
      //
      // Use the real stock count, not `G.stock.length`: `playerView` redacts the
      // stock to `[]` for clients, so on a client's optimistic reducer pass
      // `stock.length` is always 0. `stockCount` carries the true count to
      // clients and is undefined on the authoritative master (which has the real
      // stock), so this is correct in both places.
      const stockEmpty = (G.stockCount ?? G.stock.length) === 0;
      if (!G.roundOver && !G.finished && stockEmpty && G.faceUp.length === 0) {
        G.log.push("No cards left to draw — the round ends.");
        const starter = settleRound(G, ctx.playOrder, null);
        if (starter !== null) events.endTurn({ next: starter });
        return;
      }
      // A player who has left never acts, so their turn would stall the game.
      // Auto-skip it here (server-authoritative, runs as part of the previous
      // player's turn-end). We only do this during live play — at round-over we
      // wait for a present player to start the next round.
      if (G.left[ctx.currentPlayer] && !G.roundOver && !G.finished) {
        if (ctx.playOrder.every((id) => G.left[id])) {
          // Everyone has left — nothing more to play.
          G.finished = true;
          G.log.push("Everyone left — game over.");
        } else {
          G.log.push(`${tag(ctx.currentPlayer)}'s turn was skipped (left).`);
          events.endTurn();
        }
      }
    },
    // If you took the whole pile but never laid down a NEW meld, you lose 50 —
    // applied here so it fires no matter how the turn ends (discard, pass, …).
    // (closeHand handles its own case before round scoring / at game over.)
    onEnd: ({ G, ctx }) => {
      if (G.mustMeld && !G.meldedThisTurn) {
        G.scores[ctx.currentPlayer] -= PILE_PENALTY;
        G.mustMeld = false;
        G.log.push(
          `${tag(ctx.currentPlayer)} took the pile without melding (−${PILE_PENALTY}).`
        );
      }
    },
  },

  moves: {
    // ---- Draw phase (exactly one of these per turn) ----
    // `client: false` — run only on the (authoritative) master, never as an
    // optimistic client prediction. The stock is secret (redacted to `[]` in
    // playerView), so on the client `G.stock.length === 0` is always true and
    // this move would wrongly hit the reshuffle/INVALID_MOVE branch (logging
    // `ERROR: invalid move: drawFromStock` to the console — most visibly on the
    // first draw of a round and right after someone empties the pile with
    // takeFaceUpPile). The master has the real stock, so it draws correctly and
    // syncs the result back.
    drawFromStock: {
      client: false,
      move: ({ G, playerID, random }) => {
        if (G.roundOver || G.finished) return INVALID_MOVE;
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
        G.lastDrawnId = card.id;
        G.log.push(`${tag(playerID)} drew from the deck.`);
      },
    },

    drawFromFaceUp: ({ G, playerID }) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (G.hasDrawn) return INVALID_MOVE;
      if (G.faceUp.length === 0) return INVALID_MOVE;
      const card = G.faceUp.pop()!;
      G.hands[playerID].push(card);
      G.hasDrawn = true;
      G.lastDrawnId = card.id;
      G.log.push(`${tag(playerID)} drew from the pile.`);
    },

    takeFaceUpPile: ({ G, ctx, playerID }) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (G.hasDrawn) return INVALID_MOVE;
      // Taking the whole pile commits you to melding, which isn't open yet.
      if (!meldingOpen(G.turnsThisRound, ctx.numPlayers)) return INVALID_MOVE;
      if (G.faceUp.length === 0) return INVALID_MOVE;
      G.hands[playerID].push(...G.faceUp);
      G.faceUp = [];
      G.hasDrawn = true;
      G.tookPile = true;
      G.mustMeld = true; // owes a meld this turn, or −50 at discard
      G.lastDrawnId = null;
      G.log.push(`${tag(playerID)} took the entire pile.`);
    },

    // ---- Meld phase (optional, any number per turn after drawing) ----
    playMeld: (
      { G, ctx, playerID },
      cardIds: string[],
      declarations: Declaration[] = []
    ) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (!G.hasDrawn) return INVALID_MOVE;
      if (!meldingOpen(G.turnsThisRound, ctx.numPlayers)) return INVALID_MOVE;
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
      G.log.push(`${tag(playerID)} laid down a meld.`);
    },

    extendMeld: (
      { G, ctx, playerID },
      meldId: string,
      cardIds: string[],
      declarations: Declaration[] = []
    ) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (!G.hasDrawn) return INVALID_MOVE;
      if (!meldingOpen(G.turnsThisRound, ctx.numPlayers)) return INVALID_MOVE;
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
      // Adding to an existing run satisfies the "take the pile → lay cards"
      // obligation the same as opening a brand-new meld.
      G.mustMeld = false;
      G.meldedThisTurn = true;
      G.log.push(`${tag(playerID)} added cards to the table.`);
    },

    // ---- Joker swap (on your turn, if you hold the represented real card) ----
    swapJoker: ({ G, playerID }, meldId: string, placedIndex: number) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
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
        // The meld slot keeps belonging to whoever placed the joker — the
        // swapper only gains the joker for their own hand, not the points.
        placedBy: placed.placedBy,
        asRank: placed.asRank,
        asSuit: placed.asSuit,
      };
      G.hands[playerID] = hand.filter((c) => c.id !== real.id).concat(joker);
      G.log.push(`${tag(playerID)} swapped a real card in for a joker.`);
    },

    // ---- End of turn ----
    // Normal face-up discard: pile stays open, next player's turn.
    discard: ({ G, playerID, events }, cardId: string) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (!G.hasDrawn) return INVALID_MOVE;
      const hand = G.hands[playerID];
      const card = hand.find((c) => c.id === cardId);
      if (!card) return INVALID_MOVE;

      // The take-pile penalty (if owed) is applied in turn.onEnd.
      G.hands[playerID] = hand.filter((c) => c.id !== cardId);
      G.faceUp.push(card);
      G.log.push(`${tag(playerID)} discarded.`);
      events.endTurn();
    },

    // Played the whole hand onto the table — go out and pass to the next player.
    passTurn: ({ G, playerID, events }) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (!G.hasDrawn) return INVALID_MOVE;
      if (G.hands[playerID].length !== 0) return INVALID_MOVE;
      G.log.push(`${tag(playerID)} played their last card and passed.`);
      events.endTurn();
    },

    // Close the hand: place your final card face-down on the pile, ending the
    // round. The round is scored (+melds on the table, −cards left in hand).
    closeHand: ({ G, ctx, playerID, events }, cardId: string) => {
      if (G.roundOver || G.finished) return INVALID_MOVE;
      if (!G.hasDrawn) return INVALID_MOVE;
      const hand = G.hands[playerID];
      if (hand.length !== 1) return INVALID_MOVE;
      const card = hand.find((c) => c.id === cardId);
      if (!card) return INVALID_MOVE;

      if (G.mustMeld && !G.meldedThisTurn) {
        G.scores[playerID] -= PILE_PENALTY;
        G.mustMeld = false;
      }

      G.hands[playerID] = [];
      G.closingCard = card; // sits face-down on the pile; others may peek
      G.log.push(`${tag(playerID)} closed round ${G.roundNumber}.`);
      // Score the round; ends the game if someone reached the winning score,
      // else pauses for a present player to start the next round.
      const starter = settleRound(G, ctx.playOrder, playerID);
      if (starter !== null) events.endTurn({ next: starter });
    },

    // Host deals the next round (see the module-level definition); the first
    // player rotates each round.
    nextRound,

    // Quit the game; remaining players keep playing (see module-level
    // definition). Also exposed via the `spectate` stage so it works off-turn.
    leaveGame,
  },

  endIf: ({ G, ctx }) => {
    if (!G.finished) return;
    // Highest cumulative score wins.
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
