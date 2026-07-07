"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAME_IDS, type GameId } from "@/lib/multiplayer/config";
import { createRoom, joinRoom } from "@/lib/multiplayer/lobby";
import { saveIdentity } from "@/lib/multiplayer/identity";
import { useRandomAvatar } from "@/lib/multiplayer/useRandomAvatar";
import { AvatarField } from "./AvatarField";

const GAMES = [
  {
    id: GAME_IDS.fiveHundred,
    name: "500",
    tagline: "Draw, meld and close — first to 500 wins.",
    minPlayers: 2,
    maxPlayers: 6,
  },
  {
    id: GAME_IDS.piratbridge,
    name: "Piratbridge",
    tagline: "Bid blind, play trump — most points wins.",
    minPlayers: 2,
    maxPlayers: 6,
  },
  {
    id: GAME_IDS.pubgolf,
    name: "Pubgolf",
    tagline: "Crawl pub to pub — lowest score wins.",
    minPlayers: 1,
    maxPlayers: 12,
  },
];

function isGameId(value: string | undefined): value is GameId {
  return Object.values(GAME_IDS).includes(value as GameId);
}

export function NewRoom({ initialGameId }: { initialGameId?: string }) {
  const router = useRouter();
  // The game is chosen on the home page; no in-page switcher.
  const gameId: GameId = isGameId(initialGameId) ? initialGameId : GAME_IDS.fiveHundred;
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
  // Pubgolf uses a generous fixed pool of seats that fill as people join with
  // the code (even after the crawl starts), so it skips the exact-count picker.
  const isPubgolf = gameId === GAME_IDS.pubgolf;

  const [name, setName] = useState("");
  const [count, setCount] = useState(2);
  const [avatar, setAvatar] = useRandomAvatar();

  // 500 options
  const [jokers, setJokers] = useState(2);
  const [winningScore, setWinningScore] = useState(500);

  // Piratbridge options
  const [openFinalRound, setOpenFinalRound] = useState(false);
  // startingCards default depends on player count — computed below
  const maxStartingCards = Math.floor(52 / count);
  const [startingCardsOverride, setStartingCardsOverride] = useState<number | null>(null);
  const startingCards = startingCardsOverride !== null
    ? Math.min(startingCardsOverride, maxStartingCards)
    : maxStartingCards;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const player = name.trim();
    if (!player) return setError("Enter your name first.");
    setBusy(true);
    setError(null);
    try {
      const options =
        gameId === GAME_IDS.piratbridge
          ? { startingCards, openFinalRound }
          : { jokers, winningScore };
      // Pubgolf: open all 12 seats up front; people join anytime via the code.
      const createCount = isPubgolf ? game.maxPlayers : count;
      const code = await createRoom(createCount, options, gameId);
      const { playerID, playerCredentials } = await joinRoom(code, player, avatar, undefined, gameId);
      saveIdentity(code, {
        playerID,
        credentials: playerCredentials,
        name: player,
        avatarStyle: avatar.styleKey,
        avatarSeed: avatar.seed,
        gameId,
      });
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

        <div className="flex items-end gap-3">
          <AvatarField value={avatar} onChange={setAvatar} />
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-semibold text-white">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Andreas"
              maxLength={20}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">Players</p>
          {isPubgolf ? (
            <p className="text-xs text-white/50">
              Up to {game.maxPlayers} players. Everyone joins with the code — even
              after the crawl has started.
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Pubgolf: a ready-made crawl is loaded automatically — nothing to pick */}
        {isPubgolf && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white">Crawl</p>
            <p className="text-xs text-white/50">
              A ready-made 9-hole crawl is loaded automatically. Rename the bars,
              add or remove stops, and set the sips — any time, even mid-crawl.
            </p>
          </div>
        )}

        {/* 500-specific options */}
        {gameId === GAME_IDS.fiveHundred && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Jokers</p>
              <p className="text-xs text-white/50">
                How many wild jokers to shuffle into the deck.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setJokers(n)}
                    aria-pressed={jokers === n}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl font-bold tabular-nums transition ${
                      jokers === n
                        ? "bg-amber-400 text-black"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-white">Winning score</p>
                <p className="text-2xl font-bold tabular-nums text-amber-300">{winningScore}</p>
              </div>
              <p className="text-xs text-white/50">
                First to this score wins. Lower = shorter game.
              </p>
              <input
                type="range"
                min={100}
                max={1000}
                step={100}
                value={winningScore}
                onChange={(e) => setWinningScore(Number(e.target.value))}
                aria-label="Winning score"
                className="mt-3 w-full accent-amber-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-white/40">
                <span>100</span>
                <span>1000</span>
              </div>
            </div>
          </>
        )}

        {/* Piratbridge-specific options */}
        {gameId === GAME_IDS.piratbridge && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-white">Starting cards</p>
                <p className="text-2xl font-bold tabular-nums text-amber-300">{startingCards}</p>
              </div>
              <p className="text-xs text-white/50">
                Cards per player in round 1. Game counts down to 1 card. Max: {maxStartingCards} for {count} players.
              </p>
              <input
                type="range"
                min={1}
                max={maxStartingCards}
                step={1}
                value={startingCards}
                onChange={(e) => setStartingCardsOverride(Number(e.target.value))}
                aria-label="Starting cards"
                className="mt-3 w-full accent-amber-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-white/40">
                <span>1</span>
                <span>{maxStartingCards}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Open final round</p>
                  <p className="mt-0.5 text-xs text-white/50">
                    In the last round you see everyone{"'"}s card except your own.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={openFinalRound}
                  onClick={() => setOpenFinalRound((v) => !v)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    openFinalRound ? "bg-amber-400" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      openFinalRound ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="game-card rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create room"}
        </button>

        {!isPubgolf && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/40">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Link
              href="/play/solo"
              className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-center text-lg font-bold text-white transition hover:bg-white/10"
            >
              Play solo vs bot
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
