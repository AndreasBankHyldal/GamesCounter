"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUIT_SYMBOL, type Suit } from "@/lib/games";
import type { Player } from "@/lib/players";
import {
  defaultScoreTarget,
  pirateStartCards,
} from "@/lib/scoring";
import { createSession, type GameSession } from "@/lib/sessions";
import { PlayerManager } from "./PlayerManager";

export function GameSetup({
  slug,
  suit,
  title,
  backHref,
  submitLabel,
  initialPlayers,
  initialStartCards = null,
  initialScoreTarget,
  rematchOf,
}: {
  slug: string;
  suit: Suit;
  /** Heading shown next to the suit symbol. */
  title: string;
  /** Where the ← arrow goes. */
  backHref: string;
  /** Label for the confirm button. */
  submitLabel?: string;
  /** Roster to start from — omitted for a new game, carried over for a rematch. */
  initialPlayers?: Player[];
  /** Pirate Bridge starting cards; null uses the deck default. */
  initialStartCards?: number | null;
  /** 500 / Jona's spil score target. */
  initialScoreTarget?: number;
  /** The finished session this game is a rematch of, if any. */
  rematchOf?: GameSession;
}) {
  const router = useRouter();
  // null = use the deck default (floor(52 / players)).
  const [startCards, setStartCards] = useState<number | null>(
    initialStartCards
  );
  const [scoreTarget, setScoreTarget] = useState(
    initialScoreTarget ?? defaultScoreTarget(slug)
  );
  const hasScoreTarget = slug === "500" || slug === "jonas-spil";

  const start = (players: Player[]) => {
    const session = createSession({
      slug,
      players,
      startCards:
        slug === "piratbridge" ? (startCards ?? undefined) : undefined,
      winningScore: hasScoreTarget ? scoreTarget : undefined,
      rematchOf,
    });
    router.replace(`/games/${slug}/${session.id}`);
  };

  const pirateConfig = (players: Player[]) => {
    if (slug !== "piratbridge") return null;
    const hasPlayers = players.length >= 2;
    // Before two players exist the deck-default max is unknown, so assume the
    // 2-player maximum; it re-clamps automatically as players are added.
    const max = pirateStartCards(hasPlayers ? players.length : 2);
    const value = Math.min(startCards ?? max, max);
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white">Starting cards</p>
        <p className="text-xs text-white/50">
          {hasPlayers
            ? `Fewer cards = shorter game. Max ${max} for ${players.length} players.`
            : "Fewer cards = shorter game. The max adjusts to the number of players."}
        </p>
        <div className="mt-3 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setStartCards(Math.max(1, value - 1))}
            disabled={value <= 1}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30"
            aria-label="Fewer cards"
          >
            −
          </button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums text-white">
            {value}
          </span>
          <button
            type="button"
            onClick={() => setStartCards(Math.min(max, value + 1))}
            disabled={value >= max}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30"
            aria-label="More cards"
          >
            +
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-white/40">
          {value} {value === 1 ? "round" : "rounds"}
        </p>
      </div>
    );
  };

  const scoreTargetConfig = () => {
    if (!hasScoreTarget) return null;
    const playerLoses = slug === "jonas-spil";
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-white">
            {playerLoses ? "Losing score" : "Winning score"}
          </p>
          <p className="text-2xl font-bold tabular-nums text-amber-300">
            {scoreTarget}
          </p>
        </div>
        <p className="text-xs text-white/50">
          First to this score {playerLoses ? "loses" : "wins"}. Lower = shorter
          game.
        </p>
        <input
          type="range"
          min={100}
          max={1000}
          step={100}
          value={scoreTarget}
          onChange={(e) => setScoreTarget(Number(e.target.value))}
          aria-label={playerLoses ? "Losing score" : "Winning score"}
          className="mt-3 w-full accent-amber-400"
        />
        <div className="mt-1 flex justify-between text-[10px] text-white/40">
          <span>100</span>
          <span>1000</span>
        </div>
      </div>
    );
  };

  const config = (players: Player[]): ReactNode => (
    <>
      {pirateConfig(players)}
      {scoreTargetConfig()}
    </>
  );

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-10">
      <header className="mb-8 flex w-full max-w-md items-center gap-3">
        <Link
          href={backHref}
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <span aria-hidden>{SUIT_SYMBOL[suit]}</span>
          {title}
        </h1>
      </header>

      <PlayerManager
        onStart={start}
        belowPlayers={config}
        initialPlayers={initialPlayers}
        submitLabel={submitLabel}
      />
    </main>
  );
}
