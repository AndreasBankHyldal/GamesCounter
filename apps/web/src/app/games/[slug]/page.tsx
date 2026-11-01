import { notFound } from "next/navigation";
import { games, getGame } from "@/lib/games";
import { Scorekeeper } from "@/components/Scorekeeper";

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

  return <Scorekeeper />;
}
