"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getGame } from "@/lib/games";
import { GameList } from "./GameList";
import { GameSetup } from "./GameSetup";
import { GameScreen } from "./GameScreen";
import { RematchGame } from "./RematchGame";
import { ScorekeeperLink } from "./ScorekeeperLink";

// Keep every scorekeeper screen in the cached shell, including screens for
// session IDs that do not exist until a game is created offline.
export function Scorekeeper() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // A cached game-list document may be served at a session or rematch URL.
  // Read the browser pathname only after hydration.
  if (!mounted) return <main className="felt flex-1" />;

  const [prefix, slug, sessionId, action, ...rest] = pathname
    .split("/")
    .filter(Boolean);
  const game = prefix === "games" ? getGame(slug) : undefined;
  if (
    !game ||
    rest.length ||
    (action && (action !== "rematch" || sessionId === "new"))
  ) {
    return (
      <main className="felt flex flex-1 flex-col items-center justify-center gap-4 px-5">
        <p className="text-white/80">This page could not be found.</p>
        <ScorekeeperLink href="/" className="text-white underline">
          Back to games
        </ScorekeeperLink>
      </main>
    );
  }

  const props = { slug: game.slug, gameName: game.name, suit: game.suit };
  if (!sessionId) return <GameList key={pathname} {...props} />;
  if (sessionId === "new" && !action) {
    return (
      <GameSetup
        key={pathname}
        slug={game.slug}
        suit={game.suit}
        title={`New ${game.name} game`}
        backHref={`/games/${game.slug}`}
      />
    );
  }
  if (action === "rematch") {
    return <RematchGame key={pathname} {...props} sessionId={sessionId} />;
  }
  return <GameScreen key={pathname} {...props} sessionId={sessionId} />;
}
