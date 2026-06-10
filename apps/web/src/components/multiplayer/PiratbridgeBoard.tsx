"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardProps } from "boardgame.io/react";
import {
  RANK_LABEL,
  SUIT_SYMBOL,
  type Card,
  type PiratbridgeState,
  type Suit,
  type TrickCard,
} from "@gamescounter/games";
import { Avatar } from "@/components/Avatar";
import { createRoom, getRoom, joinRoom, updatePlayerData } from "@/lib/multiplayer/lobby";
import { clearIdentity, loadIdentity, saveIdentity } from "@/lib/multiplayer/identity";
import { GAME_IDS } from "@/lib/multiplayer/config";

type Props = BoardProps<PiratbridgeState>;

// ─── Card rendering ───────────────────────────────────────────────────────────

function CardFace({
  card,
  selected,
  onClick,
  disabled,
  faceDown,
  small,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
  small?: boolean;
}) {
  const suit = card.suit as Suit;
  const red = suit === "heart" || suit === "diamond";
  const rankLabel = RANK_LABEL[card.rank] ?? String(card.rank);
  const size = small ? "h-12 w-8 text-xs" : "h-16 w-11 text-sm";

  if (faceDown) {
    return (
      <div
        className={`${size} rounded-lg border-2 border-white/20 bg-blue-900 shadow`}
        aria-label="Face-down card"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`${size} flex flex-col items-center justify-center rounded-lg border-2 font-bold shadow transition select-none
        ${selected ? "scale-110 border-amber-400 bg-amber-50 ring-2 ring-amber-400/60" : "border-slate-200 bg-white"}
        ${red ? "text-red-600" : "text-slate-900"}
        ${disabled ? "cursor-not-allowed opacity-40" : onClick ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"}
      `}
    >
      <span className="leading-none">{rankLabel}</span>
      <span className="leading-none">{SUIT_SYMBOL[suit]}</span>
    </button>
  );
}

/** Small card-back stack representing hidden hand size. */
function CardBacks({ count }: { count: number }) {
  const shown = Math.min(count, 5);
  // The container needs an explicit height: its children are absolutely
  // positioned, so without it the stack collapses and the cards overlap
  // whatever sits above (the name tag / bet row).
  return (
    <div className="relative h-10 flex items-center" style={{ width: 28 + shown * 4 }}>
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className="absolute h-10 w-7 rounded border border-white/20 bg-blue-900 shadow"
          style={{ left: i * 4 }}
        />
      ))}
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white"
          aria-label={`${count} cards`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Player slot (opponents) ───────────────────────────────────────────────────

interface PlayerSlotProps {
  name: string;
  avatarStyle?: string;
  avatarSeed?: string;
  bet: number | null;
  tricksWon: number;
  handCount: number;
  hand: Card[];
  isDealer: boolean;
  isCurrentPlayer: boolean;
  betsRevealed: boolean;
  isOpenFinal: boolean;
  gamePhase: PiratbridgeState["phase"];
  /** My own seat: no card stack (the hand lives in the bottom dock). */
  isMe?: boolean;
}

function PlayerSlot({
  name,
  avatarStyle,
  avatarSeed,
  bet,
  tricksWon,
  handCount,
  hand,
  isDealer,
  isCurrentPlayer,
  betsRevealed,
  isOpenFinal,
  gamePhase,
  isMe,
}: PlayerSlotProps) {
  const firstName = name.split(" ")[0];
  const betDisplay =
    gamePhase === "betting" && !betsRevealed
      ? bet === -1
        ? "✓"
        : bet === null
          ? "?"
          : "✓"
      : bet !== null && bet !== -1
        ? String(bet)
        : "–";

  return (
    <div
      className={`flex w-[104px] flex-col items-center gap-1 rounded-2xl border px-2 py-2 backdrop-blur-sm transition ${
        isCurrentPlayer && gamePhase === "playing"
          ? "border-amber-400/80 bg-black/50 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
          : "border-white/10 bg-black/40"
      }`}
    >
      {/* Avatar + name row */}
      <div className="flex items-center gap-1.5">
        {avatarStyle && avatarSeed ? (
          <Avatar styleKey={avatarStyle} seed={avatarSeed} size={24} className="rounded-full" />
        ) : (
          <span className="h-6 w-6 rounded-full bg-white/20" />
        )}
        <span className="max-w-[60px] truncate text-xs font-semibold text-white">
          {firstName}
        </span>
        {isDealer && (
          <span className="rounded bg-amber-400/90 px-1 text-[9px] font-bold text-black">D</span>
        )}
      </div>

      {/* Bet / tricks row */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-white/60">Bet</span>
        <span className={`font-bold ${betsRevealed ? "text-amber-300" : "text-white/70"}`}>
          {betDisplay}
        </span>
        {gamePhase !== "betting" && (
          <>
            <span className="text-white/40">·</span>
            <span className="text-white/60">Won</span>
            <span className="font-bold text-green-400">{tricksWon}</span>
          </>
        )}
      </div>

      {/* Card stack below the text so it never covers the name/bet (mine
          lives in the bottom dock instead). */}
      {!isMe &&
        (isOpenFinal && hand.length > 0 ? (
          <div className="mt-1 flex gap-1">
            {hand.map((c) => (
              <CardFace key={c.id} card={c} small />
            ))}
          </div>
        ) : (
          <div className="mt-1">
            <CardBacks count={handCount} />
          </div>
        ))}
    </div>
  );
}

// ─── Main board ────────────────────────────────────────────────────────────────

export function PiratbridgeBoard({
  G,
  ctx,
  moves,
  playerID,
  matchID,
  matchData,
  isConnected,
}: Props) {
  const router = useRouter();
  const myID = playerID ?? "0";
  const isHost = myID === "0";

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, { styleKey: string; seed: string }>>({});

  const isMyTurn = ctx.currentPlayer === myID;

  // Reset selected card whenever the trick changes or it stops being my turn
  useEffect(() => {
    if (!isMyTurn) setSelectedCardId(null);
  }, [isMyTurn, G.trickCount]);

  // Reset bet amount when a new round starts
  useEffect(() => {
    setBetAmount(0);
  }, [G.roundNumber]);

  // Fetch avatars from room metadata (matchData doesn't carry player data fields)
  useEffect(() => {
    let cancelled = false;
    getRoom(matchID)
      .then((room) => {
        if (cancelled) return;
        const map: Record<string, { styleKey: string; seed: string }> = {};
        for (const p of room.players) {
          if (p.data?.avatarStyle && p.data?.avatarSeed) {
            map[String(p.id)] = { styleKey: p.data.avatarStyle as string, seed: p.data.avatarSeed as string };
          }
        }
        setAvatars(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchID, matchData]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getName(pid: string): string {
    return matchData?.find((p) => String(p.id) === pid)?.name ?? `P${parseInt(pid) + 1}`;
  }

  function getAvatar(pid: string) {
    return avatars[pid];
  }

  const myHand: Card[] = G.hands[myID] ?? [];
  const myBet = G.bets[myID];
  const hasSubmittedBet = myBet !== null;

  const isOpenFinal = G.openFinalRound && G.cardsThisRound === 1;

  const myIndex = ctx.playOrder.indexOf(myID);
  const numPlayers = ctx.numPlayers;

  // Determine which cards are legally playable this trick
  const leadSuit = G.leadSuit;
  const hasLeadSuit = leadSuit ? myHand.some((c) => c.suit === leadSuit) : false;
  function isLegalPlay(card: Card): boolean {
    if (!leadSuit) return true;
    if (card.suit === leadSuit) return true;
    return !hasLeadSuit;
  }

  // Sort hand: by suit (spades first as trump), then by rank
  const sortedHand = useMemo(() => {
    const hand = G.hands[myID] ?? [];
    const suitOrder: Record<string, number> = { spade: 0, heart: 1, diamond: 2, club: 3 };
    return [...hand].sort((a, b) => {
      const suitDiff = (suitOrder[a.suit ?? ""] ?? 9) - (suitOrder[b.suit ?? ""] ?? 9);
      if (suitDiff !== 0) return suitDiff;
      const rankA = a.rank === 1 ? 14 : a.rank;
      const rankB = b.rank === 1 ? 14 : b.rank;
      return rankA - rankB;
    });
  }, [G.hands, myID]);

  // ── Moves ────────────────────────────────────────────────────────────────────

  function handlePlaceBet() {
    moves.placeBet(betAmount);
  }

  function handlePlayCard(cardId: string) {
    moves.playCard(cardId);
    setSelectedCardId(null);
  }

  function handleNextRound() {
    moves.nextRound();
  }

  // ── Rematch (host creates new room, others follow) ────────────────────────────

  async function proposeRematch() {
    if (rematchBusy) return;
    setRematchBusy(true);
    try {
      const identity = loadIdentity(matchID);
      if (!identity) return;
      const newCode = await createRoom(ctx.numPlayers, {
        startingCards: G.startingCards,
        openFinalRound: G.openFinalRound,
      }, GAME_IDS.piratbridge);
      const { playerID: newPID, playerCredentials } = await joinRoom(
        newCode,
        getName(myID),
        identity.avatarStyle && identity.avatarSeed
          ? { styleKey: identity.avatarStyle, seed: identity.avatarSeed }
          : undefined,
        "0",
        GAME_IDS.piratbridge
      );
      saveIdentity(newCode, {
        playerID: newPID,
        credentials: playerCredentials,
        name: getName(myID),
        avatarStyle: identity.avatarStyle,
        avatarSeed: identity.avatarSeed,
        gameId: GAME_IDS.piratbridge,
      });
      // Signal the new code via player metadata so others can follow
      await updatePlayerData(matchID, myID, identity.credentials ?? "", {
        rematchCode: newCode,
      }, GAME_IDS.piratbridge);
      router.replace(`/play/${newCode}`);
    } catch {
      setRematchBusy(false);
    }
  }

  // Poll for a rematch code set by the host
  useEffect(() => {
    if (G.phase !== "gameOver" || isHost) return;
    const timer = setInterval(async () => {
      try {
        const info = await getRoom(matchID, GAME_IDS.piratbridge);
        const hostData = info.players.find((p) => p.id === 0)?.data;
        const code = hostData?.rematchCode;
        if (code) {
          clearInterval(timer);
          const identity = loadIdentity(matchID);
          if (!identity) return;
          const { playerID: newPID, playerCredentials } = await joinRoom(
            code,
            getName(myID),
            identity.avatarStyle && identity.avatarSeed
              ? { styleKey: identity.avatarStyle, seed: identity.avatarSeed }
              : undefined,
            undefined,
            GAME_IDS.piratbridge
          );
          saveIdentity(code, {
            playerID: newPID,
            credentials: playerCredentials,
            name: getName(myID),
            avatarStyle: identity.avatarStyle,
            avatarSeed: identity.avatarSeed,
            gameId: GAME_IDS.piratbridge,
          });
          setRematchPending(false);
          router.replace(`/play/${code}`);
        }
      } catch { /* ignore polling errors */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [G.phase, isHost, matchID, myID, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layout helpers ──────────────────────────────────────────────────────────

  // Everyone sits around an oval table. I'm at the bottom (90° in screen
  // coordinates, where y points down); each next player in turn order sits one
  // step CLOCKWISE around the table (bottom → left → top → right), matching
  // how play passes at a physical table.
  function seatOffset(pid: string): number {
    return (ctx.playOrder.indexOf(pid) - myIndex + numPlayers) % numPlayers;
  }

  function seatStyle(pid: string, radiusX: number, radiusY: number) {
    const theta = (Math.PI / 180) * (90 + (seatOffset(pid) * 360) / numPlayers);
    return {
      left: `${50 + radiusX * Math.cos(theta)}%`,
      top: `${50 + radiusY * Math.sin(theta)}%`,
    };
  }

  function renderSeat(pid: string) {
    const av = getAvatar(pid);
    return (
      <div
        key={pid}
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={seatStyle(pid, 42, 41)}
      >
        <PlayerSlot
          name={getName(pid)}
          avatarStyle={av?.styleKey}
          avatarSeed={av?.seed}
          bet={G.bets[pid]}
          tricksWon={G.tricksWon[pid] ?? 0}
          handCount={G.handCounts?.[pid] ?? 0}
          hand={G.hands[pid] ?? []}
          isDealer={String(G.dealerSeat) === pid}
          isCurrentPlayer={ctx.currentPlayer === pid}
          betsRevealed={G.betsRevealed}
          isOpenFinal={isOpenFinal}
          gamePhase={G.phase}
          isMe={pid === myID}
        />
      </div>
    );
  }

  // The trick on display: the live trick while cards are being played, or the
  // finished one — which stays on the table until the winner leads the next
  // card (or the round ends and the overlay takes over).
  const showingLastTrick = G.currentTrick.length === 0 && G.lastTrick !== null;
  const displayTrick: TrickCard[] = G.currentTrick.length > 0
    ? G.currentTrick
    : G.lastTrick?.cards ?? [];

  // ── Round over / Game over overlays ──────────────────────────────────────────

  const roundOverlay =
    G.phase === "roundOver" && G.lastRound ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
          <h2 className="mb-1 text-center text-xl font-bold text-white">
            Round {G.lastRound.roundNumber} complete
          </h2>
          <p className="mb-4 text-center text-xs text-white/50">
            {G.lastRound.cardsDealt} card{G.lastRound.cardsDealt !== 1 ? "s" : ""} dealt
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="pb-2 text-left">Player</th>
                <th className="pb-2 text-center">Bet</th>
                <th className="pb-2 text-center">Won</th>
                <th className="pb-2 text-right">Points</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ctx.playOrder.map((pid) => {
                const delta = G.lastRound!.deltas[pid] ?? 0;
                const correct = G.lastRound!.bets[pid] === G.lastRound!.tricksWon[pid];
                return (
                  <tr key={pid} className="border-b border-white/5">
                    <td className="py-2 font-semibold text-white">
                      {getName(pid)}
                      {pid === myID && (
                        <span className="ml-1 text-[10px] text-white/40">(you)</span>
                      )}
                    </td>
                    <td className="py-2 text-center text-white/70">
                      {G.lastRound!.bets[pid]}
                    </td>
                    <td className="py-2 text-center text-white/70">
                      {G.lastRound!.tricksWon[pid] ?? 0}
                    </td>
                    <td
                      className={`py-2 text-right font-bold ${
                        correct ? "text-green-400" : "text-rose-400"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta}
                    </td>
                    <td className="py-2 text-right font-bold text-amber-300">
                      {G.lastRound!.cumulativeScores[pid] ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-5">
            {isHost ? (
              <button
                type="button"
                onClick={handleNextRound}
                className="w-full rounded-xl bg-amber-400 py-3 font-bold text-black transition hover:bg-amber-300"
              >
                Next round →
              </button>
            ) : (
              <p className="text-center text-sm text-white/50">
                Waiting for host to start next round…
              </p>
            )}
          </div>
        </div>
      </div>
    ) : null;

  const gameOverlay =
    G.phase === "gameOver" ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
          <h2 className="mb-1 text-center text-2xl font-bold text-white">Game over!</h2>
          {(() => {
            const winner = Object.entries(G.scores).sort(([, a], [, b]) => b - a)[0];
            return (
              <p className="mb-4 text-center text-lg text-amber-300">
                {getName(winner[0])} wins with {winner[1]} points!
              </p>
            );
          })()}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="pb-2 text-left">Player</th>
                <th className="pb-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(G.scores)
                .sort(([, a], [, b]) => b - a)
                .map(([pid, score]) => (
                  <tr key={pid} className="border-b border-white/5">
                    <td className="py-2 font-semibold text-white">
                      {getName(pid)}
                      {pid === myID && (
                        <span className="ml-1 text-[10px] text-white/40">(you)</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-bold text-amber-300">{score}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-5 flex flex-col gap-2">
            {isHost ? (
              <button
                type="button"
                onClick={proposeRematch}
                disabled={rematchBusy}
                className="w-full rounded-xl bg-amber-400 py-3 font-bold text-black transition hover:bg-amber-300 disabled:opacity-50"
              >
                {rematchBusy ? "Creating room…" : "Rematch"}
              </button>
            ) : rematchPending ? (
              <p className="text-center text-sm text-white/50">
                Waiting for host to start rematch…
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setRematchPending(true)}
                className="w-full rounded-xl bg-white/10 py-3 font-semibold text-white transition hover:bg-white/20"
              >
                Waiting for rematch…
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearIdentity(matchID);
                router.replace("/play");
              }}
              className="w-full rounded-xl bg-white/5 py-2 text-sm text-white/60 transition hover:text-white"
            >
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // ── Status / hint messages ───────────────────────────────────────────────────

  function getStatusMessage(): string | null {
    if (G.phase === "betting") {
      if (hasSubmittedBet) {
        const waiting = ctx.playOrder.filter((pid) => G.bets[pid] === null).length;
        return waiting > 0
          ? `Waiting for ${waiting} more player${waiting > 1 ? "s" : ""} to bet…`
          : null;
      }
      if (isOpenFinal) return "Open round: you cannot see your own card — bet based on everyone else's!";
      return null;
    }
    if (G.phase === "playing") {
      if (isMyTurn) {
        if (G.currentTrick.length === 0) return "Your lead — play any card.";
        if (leadSuit) {
          const suitName = { spade: "Spades", heart: "Hearts", diamond: "Diamonds", club: "Clubs" }[leadSuit] ?? leadSuit;
          return hasLeadSuit
            ? `You must follow suit: ${suitName} (${SUIT_SYMBOL[leadSuit as Suit]})`
            : `No ${leadSuit}s — play any card.`;
        }
      }
      return `${getName(ctx.currentPlayer)}'s turn…`;
    }
    return null;
  }

  const statusMsg = getStatusMessage();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="felt flex min-h-screen flex-col text-white">
      {roundOverlay}
      {gameOverlay}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.replace("/play")}
            className="text-white/50 hover:text-white text-sm"
          >
            ←
          </button>
          <span className="text-sm font-bold text-white">Piratbridge</span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/60">
            Round {G.roundNumber}
            {G.phase === "playing" || G.phase === "roundOver"
              ? ` — ${G.cardsThisRound} card${G.cardsThisRound !== 1 ? "s" : ""}`
              : ""}
          </span>
          {G.startingCards > G.cardsThisRound && (
            <span className="text-xs text-white/40">
              {G.cardsThisRound} left
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Scores mini-list */}
          <div className="hidden items-center gap-2 sm:flex">
            {ctx.playOrder.map((pid) => (
              <span key={pid} className={`text-xs font-bold ${pid === myID ? "text-amber-300" : "text-white/60"}`}>
                {getName(pid).split(" ")[0]}: {G.scores[pid]}
              </span>
            ))}
          </div>
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        </div>
      </header>

      {/* ── Table area ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-4">

        {/* The round table everyone sits around */}
        <div className="relative mx-auto min-h-[360px] w-full max-w-3xl flex-1 sm:min-h-[420px]">
          {/* Table top: felt oval with a wooden rim */}
          <div
            className="absolute left-1/2 top-1/2 h-[72%] w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[10px] border-[#5d3a1d] bg-[radial-gradient(ellipse_at_center,#2e7d4f_0%,#236b41_55%,#175033_100%)] shadow-[inset_0_0_60px_rgba(0,0,0,0.45),0_12px_30px_rgba(0,0,0,0.5)] ring-2 ring-black/50"
            aria-hidden
          />

          {/* Seats: everyone around the table, clockwise in turn order */}
          {ctx.playOrder.map((pid) => renderSeat(pid))}

          {/* Played cards, each in front of the player who played it */}
          {displayTrick.map(({ playerID: pid, card }) => {
            const won = showingLastTrick && G.lastTrick?.winnerID === pid;
            return (
              <div
                key={card.id}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={seatStyle(pid, 19, 18)}
              >
                <div className={`flex flex-col items-center gap-0.5 ${showingLastTrick && !won ? "opacity-70" : ""}`}>
                  <div className={won ? "rounded-lg ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.6)]" : ""}>
                    <CardFace card={card} small />
                  </div>
                  {won && (
                    <span className="rounded bg-amber-400/90 px-1 text-[9px] font-bold text-black">
                      wins
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Centre of the table: lead suit / trick counter / dealer */}
          <div className="absolute left-1/2 top-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
            {G.phase === "playing" && G.leadSuit && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-sm font-semibold">
                <span className={G.leadSuit === "heart" || G.leadSuit === "diamond" ? "text-red-400" : "text-white"}>
                  {SUIT_SYMBOL[G.leadSuit as Suit]}
                </span>
                <span className="text-white/70">Lead</span>
              </div>
            )}
            {G.phase === "playing" && (
              <span className="text-[11px] text-white/40">
                Trick {showingLastTrick ? G.trickCount : G.trickCount + 1} of {G.cardsThisRound}
              </span>
            )}
            <span className="text-[11px] text-white/40">
              Dealer: {getName(String(G.dealerSeat)).split(" ")[0]}
            </span>
          </div>
        </div>

        {/* ── Your section ─────────────────────────────────────── */}
        <div className="mt-auto rounded-2xl border border-white/10 bg-black/20 p-4">
          {/* Your player info row */}
          <div className="mb-3 flex items-center gap-3">
            {(() => {
              const av = getAvatar(myID);
              return av?.styleKey && av.seed ? (
                <Avatar styleKey={av.styleKey} seed={av.seed} size={32} className="rounded-full" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-white/20" />
              );
            })()}
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                {getName(myID)}{" "}
                <span className="text-xs font-normal text-white/40">(you)</span>
                {String(G.dealerSeat) === myID && (
                  <span className="ml-2 rounded bg-amber-400/90 px-1 text-[9px] font-bold text-black">D</span>
                )}
              </p>
              <p className="text-xs text-white/50">
                Score: {G.scores[myID] ?? 0}
                {G.phase !== "betting" && myBet !== null && myBet !== -1 && (
                  <> · Bet: {myBet} · Won: {G.tricksWon[myID] ?? 0}</>
                )}
              </p>
            </div>
          </div>

          {/* Status message */}
          {statusMsg && (
            <p className="mb-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70">
              {statusMsg}
            </p>
          )}

          {/* ── Betting phase ─────────────────────────────────── */}
          {G.phase === "betting" && (
            <>
              {/* Your hand (face-down in open final round) */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {isOpenFinal
                  ? myHand.map((c) => <CardFace key={c.id} card={c} faceDown />)
                  : sortedHand.map((c) => (
                      <CardFace key={c.id} card={c} disabled />
                    ))}
              </div>

              {!hasSubmittedBet ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-white/70">Your bet:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBetAmount((v) => Math.max(0, v - 1))}
                      disabled={betAmount <= 0}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-2xl font-bold tabular-nums text-amber-300">
                      {betAmount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBetAmount((v) => Math.min(G.cardsThisRound, v + 1))}
                      disabled={betAmount >= G.cardsThisRound}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handlePlaceBet}
                    className="ml-auto rounded-xl bg-amber-400 px-5 py-2 font-bold text-black transition hover:bg-amber-300"
                  >
                    Lock in
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/50">
                  You bet <span className="font-bold text-amber-300">{myBet}</span> — waiting for others…
                </p>
              )}
            </>
          )}

          {/* ── Playing phase ─────────────────────────────────── */}
          {G.phase === "playing" && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {isOpenFinal && myHand.length > 0 ? (
                  // Open final round: show card face-down (own card is a mystery)
                  myHand.map((c) => (
                    <CardFace
                      key={c.id}
                      card={c}
                      faceDown
                      onClick={isMyTurn ? () => handlePlayCard(c.id) : undefined}
                      disabled={!isMyTurn}
                    />
                  ))
                ) : (
                  sortedHand.map((c) => {
                    const legal = isLegalPlay(c);
                    const isSelected = selectedCardId === c.id;
                    return (
                      <CardFace
                        key={c.id}
                        card={c}
                        selected={isSelected}
                        disabled={!isMyTurn || !legal}
                        onClick={
                          isMyTurn && legal
                            ? () => setSelectedCardId(isSelected ? null : c.id)
                            : undefined
                        }
                      />
                    );
                  })
                )}
              </div>

              {!isOpenFinal && isMyTurn && selectedCardId && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayCard(selectedCardId)}
                    className="rounded-xl bg-amber-400 px-5 py-2 font-bold text-black transition hover:bg-amber-300"
                  >
                    Play card
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCardId(null)}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
