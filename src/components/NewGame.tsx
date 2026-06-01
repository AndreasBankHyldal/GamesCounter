"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUIT_SYMBOL, type Suit } from "@/lib/games";
import type { Player } from "@/lib/players";
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

  const start = (players: Player[]) => {
    const session = createSession(slug, players);
    router.replace(`/games/${slug}/${session.id}`);
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

      <PlayerManager onStart={start} />
    </main>
  );
}
