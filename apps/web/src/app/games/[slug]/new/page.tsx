import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { GameSetup } from "@/components/GameSetup";

export default async function NewGamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <GameSetup
      slug={game.slug}
      suit={game.suit}
      title={`New ${game.name} game`}
      backHref={`/games/${game.slug}`}
    />
  );
}
