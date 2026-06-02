import { TableMount } from "@/components/multiplayer/TableMount";

export default async function TablePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <TableMount code={code.toUpperCase()} />;
}
