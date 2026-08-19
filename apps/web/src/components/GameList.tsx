"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SUIT_SYMBOL, type Suit } from "@/lib/games";
import { computeStandings } from "@/lib/scoring";
import {
  deleteSession,
  sessionsForSlug,
  type GameSession,
} from "@/lib/sessions";
import { Avatar } from "./Avatar";

function resultLabel(session: GameSession): string {
  if (session.status !== "finished") return "In progress";
  const standings = computeStandings(
    session.slug,
    session.players,
    session.rounds,
    session.winningScore
  );
  const nameOf = (id: string) =>
    session.players.find((p) => p.id === id)?.name ?? "?";
  if (
    (session.slug === "gabong" || session.slug === "jonas-spil") &&
    standings.loserIds.length
  ) {
    return `${standings.loserIds.map(nameOf).join(", ")} lost`;
  }
  if (standings.winnerIds.length) {
    return `${standings.winnerIds.map(nameOf).join(", ")} won`;
  }
  return "Finished";
}

export function GameList({
  slug,
  gameName,
  suit,
}: {
  slug: string;
  gameName: string;
  suit: Suit;
}) {
  const [sessions, setSessions] = useState<GameSession[]>([]);

  const reload = useCallback(() => setSessions(sessionsForSlug(slug)), [slug]);

  useEffect(() => {
    reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const remove = (id: string) => {
    if (!window.confirm("Delete this game?")) return;
    deleteSession(id);
    reload();
  };

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-10">
      <header className="mb-8 flex w-full max-w-md items-center gap-3">
        <Link
          href="/"
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back to games"
        >
          ←
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <span aria-hidden>{SUIT_SYMBOL[suit]}</span>
          {gameName}
        </h1>
      </header>

      <div className="w-full max-w-md">
        <Link
          href={`/games/${slug}/new`}
          className="game-card flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white"
        >
          + New game
        </Link>

        {sessions.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-white/50">
              Saved games
            </h2>
            <ul className="flex flex-col gap-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <Link
                    href={`/games/${slug}/${session.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="flex -space-x-2">
                      {session.players.slice(0, 4).map((p) => (
                        <Avatar
                          key={p.id}
                          styleKey={p.avatarStyle}
                          seed={p.avatarSeed}
                          size={28}
                          className="rounded-full ring-2 ring-felt-edge"
                        />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">
                        {session.name}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {session.players.length} players
                        {session.rematchNumber
                          ? ` · Rematch ${session.rematchNumber}`
                          : ""}{" "}
                        · {resultLabel(session)}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(session.id)}
                    className="shrink-0 rounded-full px-2 text-xl text-white/40 transition hover:text-white"
                    aria-label={`Delete ${session.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
