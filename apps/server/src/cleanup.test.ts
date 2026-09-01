import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "boardgame.io";
import { startCleanup, type CleanupSummary } from "./cleanup";

function metadata(gameover?: unknown): Server.MatchData {
  return {
    gameName: "five-hundred",
    players: {
      0: { id: 0, name: "Player", isConnected: true },
    },
    gameover,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

test("cleanup reports only unfinished surviving matches", async () => {
  const matches = new Map([
    ["active", metadata()],
    ["finished", metadata({ winner: "0" })],
  ]);
  let resolveSummary: (summary: CleanupSummary) => void = () => {};
  const summary = new Promise<CleanupSummary>((resolve) => {
    resolveSummary = resolve;
  });

  const stop = startCleanup(
    {
      listMatches: () => [...matches.keys()],
      fetch: (id: string) => ({ metadata: matches.get(id) }),
      wipe: (id: string) => {
        matches.delete(id);
      },
    },
    { onSweep: resolveSummary }
  );

  assert.deepEqual(await summary, {
    matchCount: 2,
    unfinishedMatchCount: 1,
  });
  stop();
});
