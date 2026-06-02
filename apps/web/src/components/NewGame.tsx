"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUIT_SYMBOL, type Suit } from "@/lib/games";
import type { Player } from "@/lib/players";
import { pirateStartCards } from "@/lib/scoring";
import { createSession } from "@/lib/sessions";
import { PlayerManager } from "./PlayerManager";

export function NewGame({
  slug,
  gameName,
  suit,
}: {
  slug: string;
  gameName: string;
  suit: Suit;
}) {
  const router = useRouter();
  // null = use the deck default (floor(52 / players)).
  const [startCards, setStartCards] = useState<number | null>(null);

  const start = (players: Player[]) => {
    const session = createSession(
      slug,
      players,
      slug === "piratbridge" ? (startCards ?? undefined) : undefined
    );
    router.replace(`/games/${slug}/${session.id}`);
  };

  const pirateConfig = (players: Player[]) => {
    if (slug !== "piratbridge" || players.length < 2) return null;
    const max = pirateStartCards(players.length);
    const value = Math.min(startCards ?? max, max);
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white">Starting cards</p>
        <p className="text-xs text-white/50">
          Fewer cards = shorter game. Max {max} for {players.length} players.
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

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-10">
      <header className="mb-8 flex w-full max-w-md items-center gap-3">
        <Link
          href={`/games/${slug}`}
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <span aria-hidden>{SUIT_SYMBOL[suit]}</span>
          New {gameName} game
        </h1>
      </header>

      <PlayerManager onStart={start} belowPlayers={pirateConfig} />
    </main>
  );
}
