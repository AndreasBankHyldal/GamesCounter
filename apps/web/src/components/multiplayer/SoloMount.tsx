"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SoloClient } from "@/lib/multiplayer/soloClient";

/**
 * Mounts the solo (vs-bot) game client for the human as player "0".
 * No lobby, no server connection — the bot runs entirely in the browser.
 */
export function SoloMount() {
  // Delay mounting until client-side so boardgame.io's Local transport
  // doesn't run during SSR.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) {
    return (
      <main className="felt flex flex-1 items-center justify-center text-white/70">
        Setting up…
      </main>
    );
  }

  return (
    <div className="felt relative min-h-screen">
      <Link
        href="/play"
        className="absolute right-3 top-3 z-20 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80"
      >
        Leave
      </Link>
      <SoloClient playerID="0" matchID="solo" />
    </div>
  );
}
