import Link from "next/link";
import { notFound } from "next/navigation";
import { games, getGame, SUIT_SYMBOL } from "@/lib/games";

export function generateStaticParams() {
  return games.map((game) => ({ slug: game.slug }));
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);

  if (!game) {
    notFound();
  }

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-12 text-center sm:py-16">
      <div className="mb-6 text-5xl" aria-hidden>
        {SUIT_SYMBOL[game.suit]}
      </div>
      <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
        {game.name}
      </h1>
      <p className="mt-2 text-white/70">{game.tagline}</p>

      <p className="mt-10 max-w-sm text-white/80">
        Score counting for this game is coming soon.
      </p>

      <Link
        href="/"
        className="game-card mt-8 rounded-xl px-6 py-3 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        ← Back to games
      </Link>
    </main>
  );
}
