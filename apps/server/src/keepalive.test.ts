import assert from "node:assert/strict";
import test from "node:test";
import { createKeepAlive, KEEPALIVE_HEADER } from "./keepalive";

test("keep-alive starts once after activity and marks its own ping", async () => {
  let scheduled: (() => void) | undefined;
  let scheduleCount = 0;
  let cancelCount = 0;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  const keepAlive = createKeepAlive({
    baseUrl: "https://games.example/",
    intervalMs: 600_000,
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response();
    },
    schedule: (callback) => {
      scheduled = callback;
      scheduleCount++;
      return () => cancelCount++;
    },
  });

  assert.equal(keepAlive.getStatus().state, "awaiting-activity");
  assert.equal(scheduleCount, 0);

  keepAlive.markActivity();
  keepAlive.markActivity();
  assert.equal(scheduleCount, 1);
  assert.equal(keepAlive.getStatus().state, "running");

  scheduled?.();
  await Promise.resolve();
  assert.equal(requests[0]?.url, "https://games.example/games");
  assert.equal(
    new Headers(requests[0]?.init?.headers).get(KEEPALIVE_HEADER),
    "1"
  );

  keepAlive.sleepUntilActivity();
  assert.equal(cancelCount, 1);
  assert.equal(keepAlive.getStatus().state, "manual-sleep");
});

test("manual sleep survives sweeps and resumes on activity", () => {
  let scheduleCount = 0;
  let cancelCount = 0;
  const keepAlive = createKeepAlive({
    baseUrl: "https://games.example",
    schedule: () => {
      scheduleCount++;
      return () => cancelCount++;
    },
  });

  keepAlive.markActivity();
  keepAlive.sleepUntilActivity();
  keepAlive.stopForNoUnfinishedMatches();
  assert.equal(keepAlive.getStatus().state, "manual-sleep");

  keepAlive.markActivity();
  assert.equal(scheduleCount, 2);
  assert.equal(cancelCount, 1);
  assert.equal(keepAlive.getStatus().state, "running");
});

test("finished matches stop keep-alive until new activity", () => {
  let cancelCount = 0;
  const keepAlive = createKeepAlive({
    baseUrl: "https://games.example",
    schedule: () => () => cancelCount++,
  });

  keepAlive.markActivity();
  keepAlive.stopForNoUnfinishedMatches();
  assert.equal(cancelCount, 1);
  assert.equal(keepAlive.getStatus().state, "no-unfinished-matches");

  keepAlive.markActivity();
  assert.equal(keepAlive.getStatus().state, "running");
});

test("keep-alive is disabled without a Render URL", () => {
  let scheduleCount = 0;
  const keepAlive = createKeepAlive({
    baseUrl: "",
    schedule: () => {
      scheduleCount++;
      return () => {};
    },
  });

  keepAlive.markActivity();
  assert.equal(scheduleCount, 0);
  assert.deepEqual(keepAlive.getStatus(), {
    configured: false,
    intervalMinutes: 10,
    state: "not-configured",
  });
});
