"use client";

import { useMemo, useState } from "react";
import type { BoardProps } from "boardgame.io/react";
import {
  cardValue,
  formatCard,
  jokerRepresents,
  RANK_LABEL,
  SUIT_COLOR,
  SUIT_SYMBOL,
  SUITS,
  validateExtend,
  validateNewMeld,
  WIN_SCORE,
  type Card,
  type Declaration,
  type FiveHundredState,
  type Meld,
  type PlacedCard,
  type Suit,
} from "@gamescounter/games";

type Props = BoardProps<FiveHundredState>;

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
  matchData,
  isActive,
  isConnected,
}: Props) {
  const me = playerID ?? "0";
  const [selected, setSelected] = useState<string[]>([]);
  const [jokerDecl, setJokerDecl] = useState<Record<string, { rank: number; suit: Suit }>>({});
  const [aceHigh, setAceHigh] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const myHand = useMemo(() => sortHand(G.hands[me] ?? []), [G.hands, me]);
  const others = ctx.playOrder.filter((id) => id !== me);

  function nameFor(pid: string): string {
    const entry = matchData?.find((p) => String(p.id) === pid);
    return entry?.name?.trim() || `Player ${Number(pid) + 1}`;
  }
  function handCount(pid: string): number {
    return G.handCounts?.[pid] ?? G.hands[pid]?.length ?? 0;
  }

  const selectedCards = selected
    .map((id) => myHand.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  const hasJoker = selectedCards.some((c) => c.isJoker);
  const hasAce = selectedCards.some((c) => !c.isJoker && c.rank === 1);
  const myTurn = isActive;
  const gameover = ctx.gameover as { winner?: string; scores?: Record<string, number> } | undefined;

  function toggleSelect(id: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function clearSelection() {
    setSelected([]);
    setJokerDecl({});
    setAceHigh({});
  }

  function buildDeclarations(): Declaration[] {
    const decls: Declaration[] = [];
    for (const card of selectedCards) {
      if (card.isJoker) {
        const d = jokerDecl[card.id];
        if (d) decls.push({ cardId: card.id, asRank: d.rank, asSuit: d.suit });
      } else if (card.rank === 1 && aceHigh[card.id]) {
        decls.push({ cardId: card.id, asRank: 14 });
      }
    }
    return decls;
  }

  function jokersDeclared(): boolean {
    return selectedCards.every((c) => !c.isJoker || jokerDecl[c.id]);
  }

  // ---- Move dispatch (with client-side pre-validation for instant feedback) ----
  function doMeld() {
    if (selectedCards.length < 3) return setError("Pick at least 3 cards.");
    if (!jokersDeclared()) return setError("Declare what each joker represents.");
    const decls = buildDeclarations();
    const res = validateNewMeld(selectedCards, decls, me, "preview");
    if (!res.ok) return setError(res.error ?? "That isn't a valid run.");
    moves.playMeld(selected, decls);
    clearSelection();
  }

  function doExtend(meld: Meld) {
    if (selectedCards.length < 1) return setError("Select cards to add first.");
    if (!jokersDeclared()) return setError("Declare what each joker represents.");
    const decls = buildDeclarations();
    const res = validateExtend(meld, selectedCards, decls, me);
    if (!res.ok) return setError(res.error ?? "Those cards don't extend this run.");
    moves.extendMeld(meld.id, selected, decls);
    clearSelection();
  }

  function doDiscard(faceDown: boolean) {
    if (selected.length !== 1) return setError("Select exactly one card to discard.");
    moves.discard(selected[0], faceDown);
    clearSelection();
  }

  function canSwap(placed: PlacedCard): boolean {
    if (!placed.card.isJoker) return false;
    const { suit, rank } = jokerRepresents(placed);
    return myHand.some((c) => !c.isJoker && c.suit === suit && c.rank === rank);
  }

  const canTakePile = myTurn && !G.hasDrawn && G.roundNumber > 1 && G.faceUp.length > 0;
  const canClose = myTurn && G.hasDrawn && G.roundNumber > 1 && myHand.length === 1 && selected.length === 1;
  const faceUpTop = G.faceUp[G.faceUp.length - 1];

  return (
    <div className="felt flex min-h-full flex-col gap-4 px-4 py-5 text-white">
      {/* Status bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="rounded-full bg-black/30 px-3 py-1 font-semibold">
          Round {G.roundNumber}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-semibold ${
            myTurn ? "bg-amber-400 text-black" : "bg-black/30 text-white/80"
          }`}
        >
          {gameover
            ? "Game over"
            : myTurn
              ? G.hasDrawn
                ? "Your move — meld or discard"
                : "Your move — draw a card"
              : `${nameFor(ctx.currentPlayer)}'s turn`}
        </span>
        <span className={`text-xs ${isConnected ? "text-emerald-300" : "text-rose-300"}`}>
          {isConnected ? "●online" : "○offline"}
        </span>
      </div>

      {gameover && (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-400/15 p-4 text-center">
          <p className="text-lg font-bold text-amber-200">
            🏆 {gameover.winner !== undefined ? nameFor(gameover.winner) : "Someone"} wins!
          </p>
          <p className="mt-1 text-sm text-white/70">First to {WIN_SCORE} points.</p>
        </div>
      )}

      {/* Opponents */}
      <div className="flex flex-wrap gap-2">
        {others.map((pid) => (
          <div
            key={pid}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              ctx.currentPlayer === pid
                ? "border-amber-300/60 bg-amber-400/10"
                : "border-white/10 bg-white/5"
            }`}
          >
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
            disabled={!myTurn || G.hasDrawn}
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
            <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/25 text-xs text-white/40">
              empty
            </div>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!myTurn || G.hasDrawn || G.faceUp.length === 0}
              onClick={() => moves.drawFromFaceUp()}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take 1
            </button>
            <button
              type="button"
              disabled={!canTakePile}
              title={G.roundNumber === 1 ? "Not allowed in round 1" : "Take the whole pile (then meld or −50)"}
              onClick={() => moves.takeFaceUpPile()}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take pile ({G.faceUp.length})
            </button>
          </div>
        </div>
      </div>

      {G.mustMeld && myTurn && (
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
          <div className="flex flex-col gap-2">
            {G.melds.map((meld) => (
              <div
                key={meld.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2"
              >
                <span className="text-lg" aria-hidden>
                  {SUIT_SYMBOL[meld.suit]}
                </span>
                <div className="flex flex-wrap gap-1">
                  {meld.cards.map((placed, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <CardFace card={placed.card} />
                      <span className="text-[10px] text-white/40">
                        {nameFor(placed.placedBy).split(" ")[0]}
                      </span>
                      {myTurn && canSwap(placed) && (
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
                {myTurn && G.hasDrawn && selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => doExtend(meld)}
                    className="ml-auto rounded-lg bg-emerald-500/30 px-3 py-1.5 text-xs font-semibold"
                  >
                    + Add selected
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Declarations for jokers / aces in the current selection */}
      {(hasJoker || hasAce) && (
        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
            Declare cards
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
            {selectedCards
              .filter((c) => !c.isJoker && c.rank === 1)
              .map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <span className={isRed(c) ? "suit-red" : "text-white"}>
                    {formatCard(c)} plays as
                  </span>
                  <button
                    type="button"
                    onClick={() => setAceHigh((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    className="rounded bg-white/15 px-2 py-1 text-xs font-semibold"
                  >
                    {aceHigh[c.id] ? "high (above K)" : "low (below 2)"}
                  </button>
                </label>
              ))}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/25 px-3 py-2 text-sm text-rose-100">{error}</p>
      )}

      {/* Your hand */}
      <div className="mt-auto">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {nameFor(me)} (you) · {G.scores[me] ?? 0} pts
          </h3>
          <span className="text-xs text-white/50">{myHand.length} cards</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {myHand.map((card) => (
            <CardFace
              key={card.id}
              card={card}
              selectable
              selected={selected.includes(card.id)}
              onClick={() => toggleSelect(card.id)}
            />
          ))}
        </div>

        {/* Action bar */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!myTurn || !G.hasDrawn || selectedCards.length < 3}
            onClick={doMeld}
            className="rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-semibold disabled:opacity-30"
          >
            Meld selected
          </button>
          <button
            type="button"
            disabled={!myTurn || !G.hasDrawn || selected.length !== 1}
            onClick={() => doDiscard(false)}
            className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-30"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!canClose}
            title={G.roundNumber === 1 ? "Can't close in round 1" : "Discard your last card face-down to close"}
            onClick={() => doDiscard(true)}
            className="rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-semibold text-black disabled:opacity-30"
          >
            Close round
          </button>
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
      </div>

      {/* Recent log */}
      <details className="rounded-xl bg-black/20 p-2 text-xs text-white/60">
        <summary className="cursor-pointer select-none">Game log</summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {G.log.slice(-8).reverse().map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---- Small presentational pieces ----------------------------------------

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
  const size = large ? "h-24 w-16 text-2xl" : "h-16 w-11 text-lg";
  const color = card.isJoker ? "text-fuchsia-600" : isRed(card) ? "text-card-red" : "text-neutral-900";
  const label = card.isJoker
    ? "🃏"
    : `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit as Suit]}`;
  const Tag = selectable ? "button" : "div";
  return (
    <Tag
      {...(selectable ? { type: "button", onClick } : {})}
      className={`flex ${size} shrink-0 flex-col items-center justify-center rounded-lg bg-white font-bold shadow ${color} ${
        selected ? "-translate-y-2 ring-2 ring-amber-400" : ""
      } ${selectable ? "transition hover:-translate-y-1" : ""}`}
    >
      {label}
    </Tag>
  );
}

function CardBack({ large, label }: { large?: boolean; label?: string }) {
  const size = large ? "h-24 w-16" : "h-9 w-6";
  return (
    <div
      className={`flex ${size} items-center justify-center rounded-lg border border-white/30 bg-gradient-to-br from-rose-700 to-rose-900 text-xs font-bold text-white/90 shadow`}
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
  const ranks = Array.from({ length: 14 }, (_, i) => i + 1); // 1..14 (14 = ace high)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fuchsia-300">🃏 represents</span>
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
            {r === 14 ? "A (high)" : (RANK_LABEL[r] ?? r)}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ rank: rank || 2, suit: s })}
            className={`rounded px-2 py-1 ${
              suit === s ? "bg-amber-400 text-black" : "bg-white/15"
            } ${SUIT_COLOR[s] === "red" ? "" : ""}`}
          >
            {SUIT_SYMBOL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
