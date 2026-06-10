"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiveHundredClient, PiratbridgeClient } from "@/lib/multiplayer/client";
import { loadIdentity, saveIdentity, type Identity } from "@/lib/multiplayer/identity";
import { GAME_IDS } from "@/lib/multiplayer/config";
import { getRoom } from "@/lib/multiplayer/lobby";

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
    // Verify the game type against the server before mounting a client.
    // Connecting the wrong game's client to a match makes the server apply
    // the wrong playerView to its state — never trust the stored gameId alone.
    let cancelled = false;
    getRoom(code, id.gameId)
      .then((room) => {
        if (cancelled) return;
        if (room.gameId !== id.gameId) {
          const healed = { ...id, gameId: room.gameId };
          saveIdentity(code, healed);
          setIdentity(healed);
        } else {
          setIdentity(id);
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Server unreachable — fall back to the stored identity so reconnects
        // during a server blip still work.
        setIdentity(id);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
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
