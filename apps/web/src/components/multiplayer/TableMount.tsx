"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiveHundredClient } from "@/lib/multiplayer/client";
import { loadIdentity, type Identity } from "@/lib/multiplayer/identity";

export function TableMount({ code }: { code: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = loadIdentity(code);
    if (!id) {
      // Not joined on this device — send to the waiting room to join.
      router.replace(`/play/${code}`);
      return;
    }
    setIdentity(id);
    setReady(true); // only mount the socket client on the client side
  }, [code, router]);

  if (!ready || !identity) {
    return (
      <main className="felt flex flex-1 items-center justify-center text-white/70">
        Connecting…
      </main>
    );
  }

  return (
    <div className="relative min-h-full">
      <Link
        href={`/play/${code}`}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80"
      >
        Leave
      </Link>
      <FiveHundredClient
        matchID={code}
        playerID={identity.playerID}
        credentials={identity.credentials}
      />
    </div>
  );
}
