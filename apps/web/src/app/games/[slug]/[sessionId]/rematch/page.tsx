import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { RematchGame } from "@/components/RematchGame";

export default async function RematchPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <RematchGame
      slug={game.slug}
      gameName={game.name}
      suit={game.suit}
      sessionId={sessionId}
    />
  );
}
