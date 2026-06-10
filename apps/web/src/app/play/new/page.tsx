import { NewRoom } from "@/components/multiplayer/NewRoom";

export const metadata = {
  title: "New room · Games Counter",
};

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <NewRoom initialGameId={game} />;
}
