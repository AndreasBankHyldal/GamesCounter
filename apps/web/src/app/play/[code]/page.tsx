import { WaitingRoom } from "@/components/multiplayer/WaitingRoom";

export default async function WaitingRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <WaitingRoom code={code.toUpperCase()} />;
}
