"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardProps } from "boardgame.io/react";
import {
  cardValue,
  jokerRepresents,
  RANK_LABEL,
  SUIT_COLOR,
  SUIT_SYMBOL,
  SUITS,
  validateExtend,
  validateNewMeld,
  type Card,
  type Declaration,
  type FiveHundredState,
  type PlacedCard,
  type Suit,
} from "@gamescounter/games";
import { Avatar } from "@/components/Avatar";
import { getRoom } from "@/lib/multiplayer/lobby";

type Props = BoardProps<FiveHundredState>;

type AvatarInfo = { styleKey: string; seed: string };

const SUIT_ORDER: Record<Suit, number> = { spade: 0, heart: 1, club: 2, diamond: 3 };

function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker) return 0;
    const s = SUIT_ORDER[a.suit as Suit] - SUIT_ORDER[b.suit as Suit];
    return s !== 0 ? s : a.rank - b.rank;
  });
}

function isRed(card: Card): boolean {
  return !card.isJoker && SUIT_COLOR[card.suit as Suit] === "red";
}

export function FiveHundredBoard({
  G,
  ctx,
  moves,
  playerID,
  matchID,
  matchData,
  isActive,
  isConnected,
}: Props) {
  const me = playerID ?? "0";
  const [selected, setSelected] = useState<string[]>([]);
  const [jokerDecl, setJokerDecl] = useState<Record<string, { rank: number; suit: Suit }>>({});
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, AvatarInfo>>({});

  // Fetch chosen avatars from the match metadata once (and on player changes).
  useEffect(() => {
    let cancelled = false;
    getRoom(matchID)
      .then((room) => {
        if (cancelled) return;
        const map: Record<string, AvatarInfo> = {};
        for (const p of room.players) {
          if (p.data?.avatarStyle && p.data?.avatarSeed) {
            map[String(p.id)] = { styleKey: p.data.avatarStyle, seed: p.data.avatarSeed };
          }
        }
        setAvatars(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchID, matchData]);

  const myHand = useMemo(() => sortHand(G.hands[me] ?? []), [G.hands, me]);
  const others = ctx.playOrder.filter((id) => id !== me);
  // The card you just drew (only meaningful in your own hand) — marked with an
  // arrow rather than auto-selected, so the selection never changes on its own.
  const justDrew = myHand.some((c) => c.id === G.lastDrawnId) ? G.lastDrawnId : null;

  function nameFor(pid: string): string {
    const entry = matchData?.find((p) => String(p.id) === pid);
    return entry?.name?.trim() || `Player ${Number(pid) + 1}`;
  }
  function handCount(pid: string): number {
    return G.handCounts?.[pid] ?? G.hands[pid]?.length ?? 0;
  }
  function renderLog(line: string): string {
    return line.replace(/@@(\d+)@@/g, (_, id) => nameFor(id));
  }

  const selectedCards = selected
    .map((id) => myHand.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  const hasJoker = selectedCards.some((c) => c.isJoker);
  const myTurn = isActive;
  const gameover = ctx.gameover as { winner?: string; scores?: Record<string, number> } | undefined;
  const paused = G.roundOver || Boolean(gameover);

  function toggleSelect(id: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function clearSelection() {
    setSelected([]);
    setJokerDecl({});
  }

  function buildDeclarations(): Declaration[] {
    const decls: Declaration[] = [];
    for (const card of selectedCards) {
      if (card.isJoker) {
        const d = jokerDecl[card.id];
        if (d) decls.push({ cardId: card.id, asRank: d.rank, asSuit: d.suit });
      }
    }
    return decls;
  }

  function jokersDeclared(): boolean {
    return selectedCards.every((c) => !c.isJoker || jokerDecl[c.id]);
  }

  // The meld (if any) that the current selection can legally extend.
  const declarations = buildDeclarations();
  const extendableMeld =
    selectedCards.length >= 1 && jokersDeclared()
      ? G.melds.find((m) => validateExtend(m, selectedCards, declarations, me).ok)
      : undefined;
  // Whether the current selection forms a valid brand-new run.
  const selectionIsValidMeld =
    selectedCards.length >= 3 &&
    jokersDeclared() &&
    validateNewMeld(selectedCards, declarations, me, "preview").ok;

  // ---- Move dispatch (with client-side pre-validation for instant feedback) ----
  function doMeld() {
    if (selectedCards.length < 3) return setError("Pick at least 3 cards.");
    if (!jokersDeclared()) return setError("Declare what each joker represents.");
    const res = validateNewMeld(selectedCards, declarations, me, "preview");
    if (!res.ok) return setError(res.error ?? "That isn't a valid run.");
    moves.playMeld(selected, declarations);
    clearSelection();
  }

  function doAddToTable() {
    if (!extendableMeld) return setError("Those cards don't extend any run on the table.");
    moves.extendMeld(extendableMeld.id, selected, declarations);
    clearSelection();
  }

  function doDiscard() {
    if (selected.length !== 1) return setError("Select exactly one card to discard.");
    moves.discard(selected[0]);
    clearSelection();
  }
  function doClose() {
    if (myHand.length !== 1) return;
    moves.closeHand(myHand[0].id);
    clearSelection();
  }
  function doPass() {
    moves.passTurn();
    clearSelection();
  }

  function canSwap(placed: PlacedCard): boolean {
    if (!placed.card.isJoker) return false;
    const { suit, rank } = jokerRepresents(placed);
    return myHand.some((c) => !c.isJoker && c.suit === suit && c.rank === rank);
  }

  const faceUpTop = G.faceUp[G.faceUp.length - 1];
  const canMeld = myTurn && G.hasDrawn && !paused && selectionIsValidMeld;
  const canAdd = myTurn && G.hasDrawn && !paused && Boolean(extendableMeld);
  // You can't discard a card that could be played onto a run on the table.
  const canDiscard =
    myTurn &&
    G.hasDrawn &&
    !paused &&
    selected.length === 1 &&
    myHand.length > 1 &&
    !extendableMeld;
  const canClose = myTurn && G.hasDrawn && !paused && myHand.length === 1;
  const canPass = myTurn && G.hasDrawn && !paused && myHand.length === 0;
  const canDraw = myTurn && !G.hasDrawn && !paused;

  return (
    <div className="felt flex min-h-screen flex-col gap-4 px-4 pb-8 pt-14 text-white">
      {/* Status bar (pushed below the Leave button) */}
      <div className="flex items-center justify-between text-sm">
        <span className="rounded-full bg-black/30 px-3 py-1 font-semibold">Round {G.roundNumber}</span>
        <span
          className={`rounded-full px-3 py-1 font-semibold ${
            myTurn && !paused ? "bg-amber-400 text-black" : "bg-black/30 text-white/80"
          }`}
        >
          {gameover
            ? "Game over"
            : G.roundOver
              ? "Round over"
              : myTurn
                ? G.hasDrawn
                  ? "Your move"
                  : "Draw a card"
                : `${nameFor(ctx.currentPlayer)}'s turn`}
        </span>
        <span className={`text-xs ${isConnected ? "text-emerald-300" : "text-rose-300"}`}>
          {isConnected ? "● online" : "○ offline"}
        </span>
      </div>

      {/* Round summary / game over */}
      {paused && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4">
          <p className="text-center text-lg font-bold text-amber-200">
            {gameover
              ? `🏆 ${gameover.winner !== undefined ? nameFor(gameover.winner) : "Someone"} wins!`
              : `Round ${G.roundNumber} closed${
                  G.closedBy ? ` by ${nameFor(G.closedBy)}` : ""
                }`}
          </p>
          <ul className="mx-auto mt-3 flex max-w-sm flex-col gap-1">
            {ctx.playOrder.map((pid) => {
              const delta = G.lastRound?.deltas[pid] ?? 0;
              return (
                <li key={pid} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <AvatarChip a={avatars[pid]} size={24} />
                    {nameFor(pid)}
                  </span>
                  <span className="tabular-nums">
                    <span className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {delta >= 0 ? "+" : ""}
                      {delta}
                    </span>
                    <span className="ml-2 font-bold">{G.scores[pid] ?? 0}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          {G.closingCard && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <span className="text-xs text-white/60">Closing card</span>
              {peek ? (
                <CardFace card={G.closingCard} />
              ) : (
                <button
                  type="button"
                  onClick={() => setPeek(true)}
                  className="flex flex-col items-center gap-1"
                >
                  <CardBack label="👁" />
                  <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                    Peek
                  </span>
                </button>
              )}
            </div>
          )}

          {!gameover && (
            <div className="mt-4 text-center">
              {myTurn ? (
                <button
                  type="button"
                  onClick={() => moves.nextRound()}
                  className="game-card rounded-xl px-5 py-3 text-sm font-bold text-white"
                >
                  Continue to next round
                </button>
              ) : (
                <p className="text-sm text-white/60">
                  Waiting for {G.closedBy ? nameFor(G.closedBy) : "the next round"}…
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Opponents */}
      <div className="flex flex-wrap gap-2">
        {others.map((pid) => (
          <div
            key={pid}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              ctx.currentPlayer === pid && !paused
                ? "border-amber-300/60 bg-amber-400/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <AvatarChip a={avatars[pid]} size={32} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{nameFor(pid)}</span>
              <span className="text-xs text-white/60">
                {handCount(pid)} cards · {G.scores[pid] ?? 0} pts
              </span>
            </div>
            <div className="flex -space-x-3">
              {Array.from({ length: Math.min(handCount(pid), 5) }).map((_, i) => (
                <CardBack key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Piles */}
      <div className="flex items-stretch justify-center gap-6 rounded-2xl bg-black/15 p-4">
        <div className="flex flex-col items-center gap-2">
          <CardBack large label={String(G.stockCount ?? G.stock.length)} />
          <button
            type="button"
            disabled={!canDraw}
            onClick={() => moves.drawFromStock()}
            className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-30"
          >
            Draw deck
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          {faceUpTop ? (
            <CardFace card={faceUpTop} large />
          ) : (
            <div className="flex h-28 w-20 items-center justify-center rounded-lg border-2 border-dashed border-white/25 text-xs text-white/40">
              empty
            </div>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!canDraw || G.faceUp.length === 0}
              onClick={() => moves.drawFromFaceUp()}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take 1
            </button>
            <button
              type="button"
              disabled={!canDraw || G.faceUp.length === 0}
              title="Take the whole pile (then meld or −50)"
              onClick={() => moves.takeFaceUpPile()}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take pile ({G.faceUp.length})
            </button>
          </div>
        </div>
      </div>

      {G.mustMeld && myTurn && !paused && (
        <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-center text-xs text-rose-100">
          You took the pile — play or extend a meld this turn, or lose 50 points.
        </p>
      )}

      {/* Melds on the table */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
          Melds on the table
        </h3>
        {G.melds.length === 0 ? (
          <p className="text-sm text-white/40">No melds yet.</p>
        ) : (
          // One row per suit; separate runs in a suit are spaced apart.
          <div className="flex flex-col gap-3">
            {(["heart", "diamond", "spade", "club"] as Suit[]).map((suit) => {
              const suitMelds = G.melds.filter((m) => m.suit === suit);
              if (suitMelds.length === 0) return null;
              const red = SUIT_COLOR[suit] === "red";
              return (
                <div key={suit} className="flex items-start gap-2">
                  <span
                    className={`mt-3 w-5 shrink-0 text-center text-xl ${red ? "suit-red" : "text-white/80"}`}
                    aria-hidden
                  >
                    {SUIT_SYMBOL[suit]}
                  </span>
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2 overflow-x-auto">
                    {suitMelds.map((meld) => (
                      <div key={meld.id} className="flex items-start gap-1">
                        {meld.cards.map((placed, idx) => (
                          <div key={idx} className="flex flex-col items-center">
                            {placed.card.isJoker ? (
                              <JokerOnTable placed={placed} />
                            ) : (
                              <CardFace card={placed.card} />
                            )}
                            <span className="text-[10px] text-white/40">
                              {nameFor(placed.placedBy).split(" ")[0]}
                            </span>
                            {myTurn && !paused && canSwap(placed) && (
                              <button
                                type="button"
                                onClick={() => moves.swapJoker(meld.id, idx)}
                                className="mt-0.5 rounded bg-emerald-500/30 px-1 text-[10px] font-semibold"
                              >
                                swap
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Declarations for jokers in the current selection */}
      {!paused && hasJoker && (
        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
            Declare jokers
          </h3>
          <div className="flex flex-col gap-2">
            {selectedCards
              .filter((c) => c.isJoker)
              .map((c) => (
                <JokerDeclare
                  key={c.id}
                  value={jokerDecl[c.id]}
                  onChange={(v) => setJokerDecl((p) => ({ ...p, [c.id]: v }))}
                />
              ))}
          </div>
        </div>
      )}

      {error && !paused && (
        <p className="rounded-lg bg-rose-500/25 px-3 py-2 text-sm text-rose-100">{error}</p>
      )}

      {/* Your hand */}
      <div className="mt-auto">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AvatarChip a={avatars[me]} size={24} />
            You · {G.scores[me] ?? 0} pts
          </h3>
          <span className="text-xs text-white/50">{myHand.length} cards</span>
        </div>
        {/* Single row, sorted by suit then rank. */}
        <div className="flex flex-wrap gap-1.5">
          {myHand.map((card) => (
            <HandCard
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              drawn={card.id === justDrew}
              onClick={() => toggleSelect(card.id)}
            />
          ))}
          {myHand.length === 0 && <span className="text-sm text-white/40">Empty hand.</span>}
        </div>

        {/* Action bar */}
        {!paused && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canMeld}
                onClick={doMeld}
                className="rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-semibold disabled:opacity-30"
              >
                Meld selected
              </button>
              <button
                type="button"
                disabled={!canAdd}
                onClick={doAddToTable}
                className="rounded-lg bg-emerald-500/60 px-4 py-2 text-sm font-semibold disabled:opacity-30"
              >
                Add to table
              </button>
              <button
                type="button"
                disabled={!canDiscard}
                onClick={doDiscard}
                title={
                  selected.length === 1 && extendableMeld
                    ? "This card can be added to a run on the table — play it instead"
                    : undefined
                }
                className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-30"
              >
                Discard
              </button>
              {canPass ? (
                <button
                  type="button"
                  onClick={doPass}
                  className="rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-semibold text-black"
                >
                  End turn
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canClose}
                  title="Place your last card face-down to close the round"
                  onClick={doClose}
                  className="rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-semibold text-black disabled:opacity-30"
                >
                  Close round
                </button>
              )}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg px-3 py-2 text-sm text-white/60"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-white/40">
              Selected value: {selectedCards.reduce((s, c) => s + cardValue(c), 0)} pts
            </p>
          </>
        )}
      </div>

      {/* Rules + log */}
      <details className="rounded-xl bg-black/20 p-2 text-xs text-white/70">
        <summary className="cursor-pointer select-none font-semibold">How to play</summary>
        <div className="mt-2 flex flex-col gap-2 leading-relaxed text-white/70">
          <p>
            <strong className="text-white">Goal:</strong> be the first to 500 points across
            rounds. On your turn: <em>draw</em>, optionally <em>meld</em>, then end your turn.
          </p>
          <p>
            <strong className="text-white">Draw</strong> one card from the deck, take the top of
            the face-up pile, or take the <em>whole</em> pile — but then you must lay down a meld
            this turn or lose 50 points.
          </p>
          <p>
            <strong className="text-white">Melds</strong> are 3+ cards in sequence of the same
            suit (e.g. ♥3-4-5). “Add to table” appends your selected cards to a run already on
            the table (points go to you). The <strong className="text-white">Ace</strong> is
            unbounded — it bridges King and 2, so K-A-2 (and Q-K-A-2…) are valid runs.
          </p>
          <p>
            <strong className="text-white">Jokers</strong> are wild — declare the card they
            represent; hold the real card and you may “swap” it in.
          </p>
          <p>
            <strong className="text-white">Scoring (each round):</strong> +points for cards you
            placed on the table, −points for cards left in your hand. Joker 25, ace 15, 10/J/Q/K
            10, 2–9 = 5. Reduce to one card and “Close round” to end the round; first to 500 wins.
          </p>
        </div>
      </details>
      <details className="rounded-xl bg-black/20 p-2 text-xs text-white/60">
        <summary className="cursor-pointer select-none">Game log</summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {G.log.slice(-10).reverse().map((entry, i) => (
            <li key={i}>{renderLog(entry)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---- Small presentational pieces ----------------------------------------

function AvatarChip({ a, size = 32 }: { a?: AvatarInfo; size?: number }) {
  if (!a) {
    return (
      <div
        className="shrink-0 rounded-full bg-white/15"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <Avatar styleKey={a.styleKey} seed={a.seed} size={size} className="shrink-0 rounded-full" />
  );
}

function CardFace({
  card,
  large,
  selectable,
  selected,
  onClick,
}: {
  card: Card;
  large?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const size = large ? "h-28 w-20" : "h-16 w-11";
  const Tag = selectable ? "button" : "div";
  const ring = selected ? "-translate-y-2 ring-2 ring-amber-400" : "";

  if (card.isJoker) {
    return (
      <Tag
        {...(selectable ? { type: "button", onClick } : {})}
        className={`flex ${size} shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-700 text-white shadow ${ring} ${
          selectable ? "transition hover:-translate-y-1" : ""
        }`}
      >
        <span className={`font-extrabold tracking-wide ${large ? "text-sm" : "text-[10px]"}`}>
          JOKER
        </span>
        <span className={`leading-none ${large ? "text-xl" : "text-sm"}`} aria-hidden>
          ♠♥♦♣
        </span>
        <span className={`uppercase tracking-widest opacity-80 ${large ? "text-[10px]" : "text-[7px]"}`}>
          wild
        </span>
      </Tag>
    );
  }

  const color = isRed(card) ? "text-card-red" : "text-neutral-900";
  const label = `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit as Suit]}`;
  return (
    <Tag
      {...(selectable ? { type: "button", onClick } : {})}
      className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-white font-bold shadow ${
        large ? "text-3xl" : "text-lg"
      } ${color} ${ring} ${selectable ? "transition hover:-translate-y-1" : ""}`}
    >
      {label}
    </Tag>
  );
}

/** A hand card with a reserved slot above it for the "just drawn" arrow. */
function HandCard({
  card,
  selected,
  drawn,
  onClick,
}: {
  card: Card;
  selected: boolean;
  drawn: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`h-4 text-base leading-none ${
          drawn ? "animate-bounce text-amber-300" : "text-transparent"
        }`}
        aria-hidden
      >
        ▾
      </span>
      <CardFace card={card} selectable selected={selected} onClick={onClick} />
    </div>
  );
}

/** A joker sitting in a meld: shows the represented card with a wild badge. */
function JokerOnTable({ placed }: { placed: PlacedCard }) {
  const rank = RANK_LABEL[placed.asRank] ?? placed.asRank;
  const red = SUIT_COLOR[placed.asSuit] === "red";
  return (
    <div className="relative flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-fuchsia-400 bg-white text-lg font-bold shadow">
      <span className="text-neutral-900">{rank}</span>
      <span className={red ? "text-card-red" : "text-neutral-900"}>
        {SUIT_SYMBOL[placed.asSuit]}
      </span>
      <span className="absolute -right-1 -top-1 rounded-full bg-fuchsia-500 px-1 text-[9px] font-bold text-white">
        J
      </span>
    </div>
  );
}

function CardBack({ large, label }: { large?: boolean; label?: string }) {
  const size = large ? "h-28 w-20 text-lg" : "h-9 w-6 text-xs";
  return (
    <div
      className={`flex ${size} items-center justify-center rounded-lg border border-white/30 bg-gradient-to-br from-rose-700 to-rose-900 font-bold text-white/90 shadow`}
    >
      {label}
    </div>
  );
}

function JokerDeclare({
  value,
  onChange,
}: {
  value?: { rank: number; suit: Suit };
  onChange: (v: { rank: number; suit: Suit }) => void;
}) {
  const rank = value?.rank ?? 0;
  const suit = value?.suit;
  const ranks = Array.from({ length: 13 }, (_, i) => i + 1); // 1..13 (A=1 … K=13)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fuchsia-300">Joker represents</span>
      <select
        value={rank || ""}
        onChange={(e) => onChange({ rank: Number(e.target.value), suit: suit ?? "spade" })}
        className="rounded bg-white/15 px-2 py-1 text-white"
      >
        <option value="" disabled>
          rank
        </option>
        {ranks.map((r) => (
          <option key={r} value={r} className="text-black">
            {RANK_LABEL[r] ?? r}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ rank: rank || 2, suit: s })}
            className={`rounded px-2 py-1 ${suit === s ? "bg-amber-400 text-black" : "bg-white/15"}`}
          >
            {SUIT_SYMBOL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
