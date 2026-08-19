"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Suit } from "@/lib/games";
import { defaultScoreTarget } from "@/lib/scoring";
import { getSession, type GameSession } from "@/lib/sessions";
import { GameSetup } from "./GameSetup";

export function RematchGame({
  slug,
  gameName,
  suit,
  sessionId,
}: {
  slug: string;
  gameName: string;
  suit: Suit;
  sessionId: string;
}) {
  // undefined = still reading localStorage, null = no such game.
  const [session, setSession] = useState<GameSession | null | undefined>(
    undefined
  );

  useEffect(() => {
    setSession(getSession(sessionId) ?? null);
  }, [sessionId]);

  if (session === undefined) {
    return <main className="felt flex-1" />;
  }

  if (session === null) {
    return (
      <main className="felt flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-white/80">This game could not be found.</p>
        <Link
          href={`/games/${slug}`}
          className="game-card rounded-xl px-5 py-3 font-semibold text-white"
        >
          ← Back to {gameName}
        </Link>
      </main>
    );
  }

  return (
    <GameSetup
      slug={slug}
      suit={suit}
      title={`${gameName} rematch`}
      backHref={`/games/${slug}/${session.id}`}
      submitLabel="Start rematch"
      initialPlayers={session.players}
      // Pirate Bridge stores no explicit setting: its round count *is* the
      // starting card count.
      initialStartCards={slug === "piratbridge" ? session.rounds.length : null}
      initialScoreTarget={session.winningScore ?? defaultScoreTarget(slug)}
      rematchOf={session}
    />
  );
}
