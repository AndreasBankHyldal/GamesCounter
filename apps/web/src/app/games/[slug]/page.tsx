import { notFound } from "next/navigation";
import { games, getGame } from "@/lib/games";
import { GameList } from "@/components/GameList";

export function generateStaticParams() {
  return games.map((game) => ({ slug: game.slug }));
}

export default async function GameTypePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return <GameList slug={game.slug} gameName={game.name} suit={game.suit} />;
}
