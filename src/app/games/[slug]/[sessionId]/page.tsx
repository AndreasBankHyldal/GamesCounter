import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { GameScreen } from "@/components/GameScreen";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <GameScreen
      slug={game.slug}
      gameName={game.name}
      suit={game.suit}
      sessionId={sessionId}
    />
  );
}
