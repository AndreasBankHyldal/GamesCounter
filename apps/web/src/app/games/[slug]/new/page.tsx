import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { Scorekeeper } from "@/components/Scorekeeper";

export default async function NewGamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  return <Scorekeeper />;
}
