import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { NewGame } from "@/components/NewGame";

export default async function NewGamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return <NewGame slug={game.slug} gameName={game.name} suit={game.suit} />;
}
