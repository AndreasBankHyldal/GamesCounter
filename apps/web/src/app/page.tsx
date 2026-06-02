import Link from "next/link";
import { games, SUIT_SYMBOL } from "@/lib/games";

export default function Home() {
  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-12 sm:py-16">
      {/* Header */}
      <header className="flex flex-col items-center text-center">
        <div
          className="mb-5 flex items-center gap-3 text-3xl sm:text-4xl"
          aria-hidden
        >
          <span className="suit-black drop-shadow">♠</span>
          <span className="suit-red drop-shadow">♥</span>
          <span className="suit-red drop-shadow">♦</span>
          <span className="suit-black drop-shadow">♣</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-5xl">
          Games Counter
        </h1>
        <p className="mt-3 max-w-sm text-base text-white/70">
          Keep score for your favourite card games.
        </p>
      </header>

      {/* Game picker */}
      <section className="mt-12 w-full max-w-md">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-white/50">
          Pick a game
        </h2>
        <ul className="flex flex-col gap-4">
          {games.map((game) => (
            <li key={game.slug}>
              <Link
                href={`/games/${game.slug}`}
                className="game-card flex items-center gap-4 rounded-2xl px-6 py-5 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-3xl"
                  aria-hidden
                >
                  {SUIT_SYMBOL[game.suit]}
                </span>
                <span className="flex flex-col">
                  <span className="text-xl font-bold leading-tight">
                    {game.name}
                  </span>
                  <span className="text-sm text-white/75">{game.tagline}</span>
                </span>
                <span
                  className="game-card__watermark font-serif"
                  aria-hidden
                >
                  {SUIT_SYMBOL[game.suit]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Multiplayer */}
      <section className="mt-10 w-full max-w-md">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-white/50">
          Or play online
        </h2>
        <Link
          href="/play"
          className="game-card flex items-center gap-4 rounded-2xl px-6 py-5 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-3xl"
            aria-hidden
          >
            🌐
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-bold leading-tight">Play 500 online</span>
            <span className="text-sm text-white/75">
              Real cards, hidden hands, with friends
            </span>
          </span>
        </Link>
      </section>
    </main>
  );
}
