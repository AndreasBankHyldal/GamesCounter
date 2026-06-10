"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiveHundredClient, PiratbridgeClient } from "@/lib/multiplayer/client";
import { loadIdentity, type Identity } from "@/lib/multiplayer/identity";
import { GAME_IDS } from "@/lib/multiplayer/config";

export function TableMount({ code }: { code: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = loadIdentity(code);
    if (!id) {
      router.replace(`/play/${code}`);
      return;
    }
    setIdentity(id);
    setReady(true);
  }, [code, router]);

  if (!ready || !identity) {
    return (
      <main className="felt flex flex-1 items-center justify-center text-white/70">
        Connecting…
      </main>
    );
  }

  const sharedProps = {
    matchID: code,
    playerID: identity.playerID,
    credentials: identity.credentials,
  };

  return (
    <div className="felt relative min-h-screen">
      {identity.gameId === GAME_IDS.piratbridge ? (
        <PiratbridgeClient {...sharedProps} />
      ) : (
        <FiveHundredClient {...sharedProps} />
      )}
    </div>
  );
}
