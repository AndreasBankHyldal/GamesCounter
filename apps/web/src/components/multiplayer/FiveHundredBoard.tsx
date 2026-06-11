"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardProps } from "boardgame.io/react";
import {
  cardValue,
  jokerRepresents,
  meldingOpen,
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
import { createRoom, getRoom, joinRoom, updatePlayerData, type RoomInfo } from "@/lib/multiplayer/lobby";
import { clearIdentity, loadIdentity, saveIdentity } from "@/lib/multiplayer/identity";
import {
  playAdd,
  playClose,
  playDeal,
  playDiscard,
  playDraw,
  playMeld,
  playPass,
  playPile,
  playSwap,
  playTurnChime,
  playWin,
} from "@/lib/multiplayer/sound";

const SOUND_KEY = "gc:mp:sound";

type Props = BoardProps<FiveHundredState>;

type AvatarInfo = { styleKey: string; seed: string };

// Canonical within-colour suit order. Suits of the same colour (♠♣ black, ♥♦
// red) are interleaved so two same-colour suits never sit next to each other in
// the hand — unless the hand only holds one colour, where it's unavoidable.
const BLACK_SUITS: Suit[] = ["spade", "club"];
const RED_SUITS: Suit[] = ["heart", "diamond"];

function sortHand(cards: Card[]): Card[] {
  const jokers = cards.filter((c) => c.isJoker);

  // Group real cards by suit; each suit's cards sorted by rank ascending.
  const bySuit = new Map<Suit, Card[]>();
  for (const c of cards) {
    if (c.isJoker) continue;
    const suit = c.suit as Suit;
    const arr = bySuit.get(suit) ?? [];
    arr.push(c);
    bySuit.set(suit, arr);
  }
  for (const arr of bySuit.values()) arr.sort((a, b) => a.rank - b.rank);

  // Present suit-groups, split by colour in canonical order.
  const black = BLACK_SUITS.filter((s) => bySuit.has(s));
  const red = RED_SUITS.filter((s) => bySuit.has(s));

  // Interleave the two colours, starting with whichever has more groups, so
  // colours alternate (B R B R) as much as the hand allows.
  const [first, second] = black.length >= red.length ? [black, red] : [red, black];
  const orderedSuits: Suit[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (i < first.length) orderedSuits.push(first[i]);
    if (i < second.length) orderedSuits.push(second[i]);
  }

  const result: Card[] = [];
  for (const suit of orderedSuits) result.push(...(bySuit.get(suit) ?? []));
  result.push(...jokers);
  return result;
}

function isRed(card: Card): boolean {
  return !card.isJoker && SUIT_COLOR[card.suit as Suit] === "red";
}

/**
 * Burst confetti outward from the winner popup box. `canvas-confetti` is loaded
 * lazily (client-only, kept out of the initial bundle). Origin is the box's
 * centre so the confetti appears to pop out of it.
 */
function celebrate(boxEl: HTMLElement | null) {
  import("canvas-confetti")
    .then(({ default: confetti }) => {
      const colors = ["#fbbf24", "#f59e0b", "#ffffff", "#34d399", "#f43f5e"];
      let origin = { x: 0.5, y: 0.4 };
      if (boxEl) {
        const r = boxEl.getBoundingClientRect();
        origin = {
          x: (r.left + r.width / 2) / window.innerWidth,
          y: (r.top + r.height / 2) / window.innerHeight,
        };
      }
      const common = { colors, zIndex: 9999, disableForReducedMotion: true };
      // A central pop plus two side jets, for a fuller burst out of the box.
      confetti({ ...common, particleCount: 130, spread: 100, startVelocity: 45, origin });
      confetti({ ...common, particleCount: 60, angle: 60, spread: 70, origin: { x: Math.max(0, origin.x - 0.1), y: origin.y } });
      confetti({ ...common, particleCount: 60, angle: 120, spread: 70, origin: { x: Math.min(1, origin.x + 0.1), y: origin.y } });
    })
    .catch(() => {});
}

export function FiveHundredBoard({
  G,
  ctx,
  moves,
  playerID,
  matchID,
  matchData,
  isConnected,
}: Props) {
  const router = useRouter();
  const me = playerID ?? "0";
  const [selected, setSelected] = useState<string[]>([]);
  const [jokerDecl, setJokerDecl] = useState<Record<string, { rank: number; suit: Suit }>>({});
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, AvatarInfo>>({});
  const summaryBoxRef = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(true);
  const wasMyTurn = useRef(false);

  // Load the sound preference after mount (avoids SSR mismatch).
  useEffect(() => {
    setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off");
  }, []);
  function toggleSound() {
    setSoundOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
  // Every seat is kept "active" (so off-turn players can send `leaveGame`), so
  // `isActive` is no longer a reliable "it's my turn" signal — derive it from
  // the current player instead.
  const myTurn = ctx.currentPlayer === me;
  const gameover = ctx.gameover as { winner?: string; scores?: Record<string, number> } | undefined;
  const paused = G.roundOver || Boolean(gameover);

  // Chime when it becomes your turn (rising edge of an active, non-paused turn).
  const myTurnActive = myTurn && !paused;
  useEffect(() => {
    if (myTurnActive && !wasMyTurn.current && soundOn) playTurnChime();
    wasMyTurn.current = myTurnActive;
  }, [myTurnActive, soundOn]);

  /** Play a sound effect, unless the player has muted. */
  const sfx = (fn: () => void) => {
    if (soundOn) fn();
  };

  // Victory fanfare + confetti when the game ends (on the rising edge only).
  const isOver = Boolean(gameover);
  const wasOver = useRef(false);
  useEffect(() => {
    if (isOver && !wasOver.current) {
      if (soundOn) playWin();
      celebrate(summaryBoxRef.current);
    }
    wasOver.current = isOver;
  }, [isOver, soundOn]);

  // ---- Rematch ----
  const [rematchRoom, setRematchRoom] = useState<RoomInfo | null>(null);
  const [rematchLoading, setRematchLoading] = useState(false);
  const hasNavigatedRematch = useRef(false);
  const isAdmin = me === "0";

  // Poll room metadata for rematch coordination once the game is over.
  useEffect(() => {
    if (!isOver || matchID === "solo") return;
    const poll = () => getRoom(matchID).then(setRematchRoom).catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [isOver, matchID]);

  const seat0 = rematchRoom?.players.find((p) => p.id === 0);
  const rematchPending = seat0?.data?.rematchPending === true;
  const rematchCode = seat0?.data?.rematchCode as string | undefined;
  const myRematchData = rematchRoom?.players.find((p) => String(p.id) === me)?.data;
  const iHaveAccepted = isAdmin || myRematchData?.rematchAccepted === true;
  const acceptedCount = rematchRoom
    ? rematchRoom.players.filter((p) => p.id === 0 || p.data?.rematchAccepted).length
    : 1;

  // Non-admin: when admin has set rematchCode and I accepted, auto-join + navigate.
  useEffect(() => {
    if (!rematchCode || isAdmin || !iHaveAccepted || hasNavigatedRematch.current) return;
    hasNavigatedRematch.current = true;
    const identity = loadIdentity(matchID);
    if (!identity) return;
    const avatar =
      identity.avatarStyle && identity.avatarSeed
        ? { styleKey: identity.avatarStyle, seed: identity.avatarSeed }
        : undefined;
    joinRoom(rematchCode, identity.name, avatar)
      .then(({ playerID: newPID, playerCredentials: newCreds }) => {
        saveIdentity(rematchCode, {
          playerID: newPID,
          credentials: newCreds,
          name: identity.name,
          avatarStyle: identity.avatarStyle,
          avatarSeed: identity.avatarSeed,
        });
        router.push(`/play/${rematchCode}`);
      })
      .catch(() => {});
  }, [rematchCode, isAdmin, iHaveAccepted, matchID]);

  async function proposeRematch() {
    const identity = loadIdentity(matchID);
    if (!identity) return;
    await updatePlayerData(matchID, me, identity.credentials, {
      ...(seat0?.data ?? {}),
      rematchPending: true,
    });
  }

  async function acceptRematch() {
    const identity = loadIdentity(matchID);
    if (!identity) return;
    await updatePlayerData(matchID, me, identity.credentials, {
      ...(myRematchData ?? {}),
      rematchAccepted: true,
    });
  }

  async function startRematch() {
    const identity = loadIdentity(matchID);
    if (!identity) return;
    setRematchLoading(true);
    try {
      const newCode = await createRoom(acceptedCount, {
        jokers: G.jokers,
        winningScore: G.winningScore,
      });
      const avatar =
        identity.avatarStyle && identity.avatarSeed
          ? { styleKey: identity.avatarStyle, seed: identity.avatarSeed }
          : undefined;
      const { playerID: newPID, playerCredentials: newCreds } = await joinRoom(
        newCode,
        identity.name,
        avatar,
        "0"
      );
      saveIdentity(newCode, {
        playerID: newPID,
        credentials: newCreds,
        name: identity.name,
        avatarStyle: identity.avatarStyle,
        avatarSeed: identity.avatarSeed,
      });
      await updatePlayerData(matchID, me, identity.credentials, {
        ...(seat0?.data ?? {}),
        rematchCode: newCode,
      });
      hasNavigatedRematch.current = true;
      router.push(`/play/${newCode}`);
    } catch {
      setRematchLoading(false);
    }
  }

  // Keep the selection in sync with your hand: when cards leave (a successful
  // meld/discard) they drop out of the selection automatically; if a move is
  // rejected and reverted, the cards return and the selection is preserved so
  // you can simply try again.
  useEffect(() => {
    setSelected((sel) => {
      const next = sel.filter((id) => myHand.some((c) => c.id === id));
      return next.length === sel.length ? sel : next;
    });
  }, [myHand]);

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

  // Can your single last card be added to a run on the table? (A joker fits any
  // existing run.) If so, you must play it rather than close with it.
  const lastCard = myHand.length === 1 ? myHand[0] : undefined;
  const lastCardPlayable = lastCard
    ? lastCard.isJoker
      ? G.melds.length > 0
      : G.melds.some((m) => validateExtend(m, [lastCard], [], me).ok)
    : false;

  // ---- Move dispatch (with client-side pre-validation for instant feedback) ----
  function doMeld() {
    if (selectedCards.length < 3) return setError("Pick at least 3 cards.");
    if (!jokersDeclared()) return setError("Declare what each joker represents.");
    const res = validateNewMeld(selectedCards, declarations, me, "preview");
    if (!res.ok) return setError(res.error ?? "That isn't a valid run.");
    sfx(playMeld);
    moves.playMeld(selected, declarations);
  }

  function doAddToTable() {
    if (!extendableMeld) return setError("Those cards don't extend any run on the table.");
    sfx(playAdd);
    moves.extendMeld(extendableMeld.id, selected, declarations);
  }

  function doDiscard() {
    if (selected.length !== 1) return setError("Select exactly one card to discard.");
    sfx(playDiscard);
    moves.discard(selected[0]);
  }
  function doClose() {
    if (myHand.length !== 1) return;
    sfx(playClose);
    moves.closeHand(myHand[0].id);
  }
  function doPass() {
    sfx(playPass);
    moves.passTurn();
  }
  function doLeave() {
    const ok = window.confirm(
      "Leave the game? The others keep playing without you, and your turns are skipped."
    );
    if (!ok) return;
    // Flag yourself as left so the server auto-skips your turns, then go home.
    // Works whether or not it's your turn (the move is allowed off-turn).
    try {
      moves.leaveGame();
    } catch {
      /* ignore — leaving regardless */
    }
    clearIdentity(matchID);
    router.push("/");
  }

  function canSwap(placed: PlacedCard): boolean {
    if (!placed.card.isJoker) return false;
    const { suit, rank } = jokerRepresents(placed);
    return myHand.some((c) => !c.isJoker && c.suit === suit && c.rank === rank);
  }

  const faceUpTop = G.faceUp[G.faceUp.length - 1];
  // Melding (and taking the whole pile) only opens after everyone's first turn.
  const meldsOpen = meldingOpen(G.turnsThisRound, ctx.numPlayers);
  const canMeld = myTurn && G.hasDrawn && !paused && meldsOpen && selectionIsValidMeld;
  const canAdd = myTurn && G.hasDrawn && !paused && meldsOpen && Boolean(extendableMeld);
  // You can't discard a card that could be played onto a run on the table.
  const canDiscard =
    myTurn &&
    G.hasDrawn &&
    !paused &&
    selected.length === 1 &&
    myHand.length > 1 &&
    !extendableMeld;
  const canClose =
    myTurn && G.hasDrawn && !paused && myHand.length === 1 && !lastCardPlayable;
  const canPass = myTurn && G.hasDrawn && !paused && myHand.length === 0;
  const canDraw = myTurn && !G.hasDrawn && !paused;

  return (
    <div className="felt relative flex min-h-screen flex-col gap-4 px-4 pb-8 pt-3 text-white">
      {/* Status bar. The right side stacks the Leave button above the
          connection indicator so they never overlap. */}
      <div className="flex items-start justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-black/30 px-3 py-1 font-semibold">
            Round {G.roundNumber}
          </span>
          <button
            type="button"
            onClick={toggleSound}
            title={soundOn ? "Mute turn sound" : "Unmute turn sound"}
            aria-label={soundOn ? "Mute turn sound" : "Unmute turn sound"}
            className="rounded-full bg-black/30 px-2 py-1 text-base leading-none"
          >
            {soundOn ? "🔔" : "🔕"}
          </button>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-semibold ${
            myTurnActive ? "animate-pulse bg-amber-400 text-black ring-2 ring-amber-200" : "bg-black/30 text-white/80"
          }`}
        >
          {gameover
            ? "Game over"
            : G.roundOver
              ? "Round over"
              : myTurn
                ? G.hasDrawn
                  ? "Your move"
                  : "Your turn — draw"
                : `${nameFor(ctx.currentPlayer)}'s turn`}
        </span>
        <div className="flex flex-col items-end gap-1">
          {/* Leave the game — flags you as left so the server skips your turns
              and the others keep playing. (Solo play has its own exit link in
              SoloMount, where there's no one to unblock.) */}
          {matchID !== "solo" && (
            <button
              type="button"
              onClick={doLeave}
              className="rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 hover:bg-black/60"
            >
              Leave
            </button>
          )}
          <span className={`text-xs ${isConnected ? "text-emerald-300" : "text-rose-300"}`}>
            {isConnected ? "● online" : "○ offline"}
          </span>
        </div>
      </div>

      {/* Round summary / game over */}
      {paused && (
        <div
          ref={summaryBoxRef}
          className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4"
        >
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
              {/* The rotated starter advances the round; if they've left, any
                  present player can step in (nextRound is allowed off-turn). */}
              {!G.left[me] && (myTurn || G.left[ctx.currentPlayer]) ? (
                <button
                  type="button"
                  onClick={() => {
                    sfx(playDeal);
                    moves.nextRound();
                  }}
                  className="game-card rounded-xl px-5 py-3 text-sm font-bold text-white"
                >
                  Continue to next round
                </button>
              ) : (
                <p className="text-sm text-white/60">
                  Waiting for the game leader to start the next round…
                </p>
              )}
            </div>
          )}

          {/* Rematch — only for real multiplayer games, not solo */}
          {gameover && matchID !== "solo" && (
            <div className="mt-4 flex flex-col items-center gap-3">
              {isAdmin ? (
                <>
                  {!rematchPending ? (
                    <button
                      type="button"
                      onClick={proposeRematch}
                      className="game-card rounded-xl px-5 py-3 text-sm font-bold text-white"
                    >
                      🔁 Propose rematch
                    </button>
                  ) : !rematchCode ? (
                    <>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {rematchRoom?.players
                          .filter((p) => p.id !== 0)
                          .map((p) => (
                            <span
                              key={p.id}
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                p.data?.rematchAccepted
                                  ? "bg-emerald-500/30 text-emerald-200"
                                  : "bg-white/10 text-white/40"
                              }`}
                            >
                              {p.name ?? `Player ${p.id + 1}`}{" "}
                              {p.data?.rematchAccepted ? "✓" : "…"}
                            </span>
                          ))}
                      </div>
                      <button
                        type="button"
                        onClick={startRematch}
                        disabled={rematchLoading || acceptedCount < 1}
                        className="game-card rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {rematchLoading
                          ? "Starting…"
                          : `Start rematch (${acceptedCount} player${acceptedCount !== 1 ? "s" : ""})`}
                      </button>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {rematchPending && !iHaveAccepted && (
                    <button
                      type="button"
                      onClick={acceptRematch}
                      className="game-card rounded-xl px-5 py-3 text-sm font-bold text-white"
                    >
                      ✓ Accept rematch
                    </button>
                  )}
                  {iHaveAccepted && (
                    <p className="text-sm text-white/60">
                      {rematchCode ? "Joining new game…" : "Waiting for host to start…"}
                    </p>
                  )}
                  {!rematchPending && (
                    <p className="text-sm text-white/40">Waiting for host to propose a rematch…</p>
                  )}
                </>
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
              <span className="text-sm font-semibold">
                {nameFor(pid)}
                {G.left[pid] && (
                  <span className="ml-1 rounded bg-white/15 px-1 text-[10px] font-normal text-white/60">
                    left
                  </span>
                )}
              </span>
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
          <CardBack medium label={String(G.stockCount ?? G.stock.length)} />
          <button
            type="button"
            disabled={!canDraw}
            onClick={() => {
              sfx(playDraw);
              moves.drawFromStock();
            }}
            className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-30"
          >
            Draw deck
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          {faceUpTop ? (
            <CardFace card={faceUpTop} medium />
          ) : (
            <div className="flex h-20 w-14 items-center justify-center rounded-lg border-2 border-dashed border-white/25 text-xs text-white/40">
              empty
            </div>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!canDraw || G.faceUp.length === 0}
              onClick={() => {
                sfx(playDraw);
                moves.drawFromFaceUp();
              }}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take 1
            </button>
            <button
              type="button"
              disabled={!canDraw || G.faceUp.length <= 1 || !meldsOpen}
              title={
                !meldsOpen
                  ? "Opens once everyone has had a turn"
                  : G.faceUp.length === 1
                    ? "Only one card on the pile — use Take 1"
                    : "Take the whole pile (then lay 3 consecutive cards or −50)"
              }
              onClick={() => {
                sfx(playPile);
                moves.takeFaceUpPile();
              }}
              className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold disabled:opacity-30"
            >
              Take pile ({G.faceUp.length})
            </button>
          </div>
        </div>
      </div>

      {myTurn && !paused && !meldsOpen && (
        <p className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs text-white/70">
          Melding opens once everyone has had their first turn.
        </p>
      )}

      {G.mustMeld && myTurn && !paused && (
        <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-center text-xs text-rose-100">
          You took the pile — lay 3+ consecutive cards in one go (a new meld, or one
          block added to a run on the table) this turn, or lose 50 points.
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
              // Order separate runs in a suit by their starting rank, so a
              // lower run (e.g. A-2-3) sits before a higher one (4-5-6)
              // regardless of the order they were laid down. Each meld's cards
              // are already arc-ordered, so cards[0].asRank is the run's start.
              const suitMelds = G.melds
                .filter((m) => m.suit === suit)
                .sort((a, b) => (a.cards[0]?.asRank ?? 0) - (b.cards[0]?.asRank ?? 0));
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
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                    {suitMelds.map((meld) => (
                      <div key={meld.id} className="flex items-start gap-1">
                        {meld.cards.map((placed, idx) => (
                          <div key={idx} className="flex w-11 flex-col items-center">
                            {placed.card.isJoker ? (
                              <JokerOnTable placed={placed} />
                            ) : (
                              <CardFace card={placed.card} />
                            )}
                            <span
                              className="w-full truncate text-center text-[10px] text-white/40"
                              title={nameFor(placed.placedBy)}
                            >
                              {nameFor(placed.placedBy).split(" ")[0]}
                            </span>
                            {myTurn && !paused && canSwap(placed) && (
                              <button
                                type="button"
                                onClick={() => {
                                  sfx(playSwap);
                                  moves.swapJoker(meld.id, idx);
                                }}
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
                  title={
                    lastCardPlayable
                      ? "Your last card can be played on the table — you can't close with it"
                      : "Place your last card face-down to close the round"
                  }
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
            <strong className="text-white">Goal:</strong> be the first to {G.winningScore} points
            across rounds. On your turn: <em>draw</em>, optionally <em>meld</em>, then end your turn.
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
            10, 2–9 = 5. Reduce to one card and “Close round” to end the round; first to{" "}
            {G.winningScore} wins.
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
  medium,
  selectable,
  selected,
  onClick,
}: {
  card: Card;
  large?: boolean;
  medium?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const size = large ? "h-28 w-20" : medium ? "h-20 w-14" : "h-16 w-11";
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
        <span className={`font-extrabold tracking-wide ${large ? "text-sm" : medium ? "text-xs" : "text-[10px]"}`}>
          JOKER
        </span>
        <span className={`leading-none ${large ? "text-xl" : medium ? "text-base" : "text-sm"}`} aria-hidden>
          ♠♥♦♣
        </span>
        <span className={`uppercase tracking-widest opacity-80 ${large || medium ? "text-[10px]" : "text-[7px]"}`}>
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
        large ? "text-3xl" : medium ? "text-2xl" : "text-lg"
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

function CardBack({ large, medium, label }: { large?: boolean; medium?: boolean; label?: string }) {
  const size = large ? "h-28 w-20 text-lg" : medium ? "h-20 w-14 text-base" : "h-9 w-6 text-xs";
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
