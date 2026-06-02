"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAMES } from "@gamescounter/games";
import { createRoom, joinRoom } from "@/lib/multiplayer/lobby";
import { saveIdentity } from "@/lib/multiplayer/identity";

export function NewRoom() {
  const router = useRouter();
  // 500 is the only multiplayer game for now.
  const game = GAMES[0];
  const [name, setName] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const player = name.trim();
    if (!player) return setError("Enter your name first.");
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom(count);
      const { playerID, playerCredentials } = await joinRoom(code, player);
      saveIdentity(code, { playerID, credentials: playerCredentials, name: player });
      router.replace(`/play/${code}`);
    } catch {
      setError("Couldn't create the room. Is the game server running?");
      setBusy(false);
    }
  }

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-10">
      <header className="mb-8 flex w-full max-w-md items-center gap-3">
        <Link
          href="/play"
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          New room
        </h1>
      </header>

      <section className="flex w-full max-w-md flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-xl font-bold text-white">{game.name}</p>
          <p className="text-sm text-white/60">{game.tagline}</p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-white">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Andreas"
            maxLength={20}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
          />
        </label>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">Players</p>
          <p className="text-xs text-white/50">
            {game.minPlayers}–{game.maxPlayers} players. Everyone joins with the code.
          </p>
          <div className="mt-3 flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setCount((c) => Math.max(game.minPlayers, c - 1))}
              disabled={count <= game.minPlayers}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30"
              aria-label="Fewer players"
            >
              −
            </button>
            <span className="w-12 text-center text-3xl font-bold tabular-nums text-white">
              {count}
            </span>
            <button
              type="button"
              onClick={() => setCount((c) => Math.min(game.maxPlayers, c + 1))}
              disabled={count >= game.maxPlayers}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:opacity-30"
              aria-label="More players"
            >
              +
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="game-card rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create room"}
        </button>
      </section>
    </main>
  );
}
