export type KeepAliveState =
  | "running"
  | "awaiting-activity"
  | "manual-sleep"
  | "no-unfinished-matches"
  | "not-configured"
  | "shutdown";

export interface KeepAliveStatus {
  configured: boolean;
  intervalMinutes: number;
  state: KeepAliveState;
}

export interface KeepAliveController {
  markActivity: () => void;
  sleepUntilActivity: () => void;
  stopForNoUnfinishedMatches: () => void;
  shutdown: () => void;
  getStatus: () => KeepAliveStatus;
}

interface KeepAliveOptions {
  baseUrl?: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  schedule?: (callback: () => void, intervalMs: number) => () => void;
}

const TEN_MINUTES = 10 * 60 * 1000;
export const KEEPALIVE_HEADER = "x-gamescounter-keepalive";

/**
 * Keeps Render awake only after real game activity. The controller starts
 * dormant so stale persisted matches cannot wake themselves after a cold boot.
 */
export function createKeepAlive(options: KeepAliveOptions = {}): KeepAliveController {
  const intervalMs = options.intervalMs ?? TEN_MINUTES;
  const base = options.baseUrl ?? process.env.RENDER_EXTERNAL_URL;
  const url = base ? `${base.replace(/\/$/, "")}/games` : undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const scheduledTimer = setInterval(callback, delay);
      scheduledTimer.unref();
      return () => clearInterval(scheduledTimer);
    });

  let cancelTimer: (() => void) | null = null;
  let stoppedPermanently = false;
  let state: KeepAliveState = url ? "awaiting-activity" : "not-configured";

  const stopTimer = () => {
    if (!cancelTimer) return;
    cancelTimer();
    cancelTimer = null;
  };

  const start = () => {
    if (!url || cancelTimer || stoppedPermanently) return;
    const ping = () => {
      void fetchImpl(url, {
        headers: { [KEEPALIVE_HEADER]: "1" },
      }).catch((err) =>
        console.error("[keepalive] ping failed:", err?.message ?? err)
      );
    };

    cancelTimer = schedule(ping, intervalMs);
    state = "running";
    console.log(
      `[keepalive] activity detected — pinging ${url} every ` +
        `${Math.round(intervalMs / 60000)} min`
    );
  };

  return {
    markActivity: () => {
      if (!url || stoppedPermanently) return;
      start();
    },
    sleepUntilActivity: () => {
      if (stoppedPermanently) return;
      stopTimer();
      state = url ? "manual-sleep" : "not-configured";
      console.log("[keepalive] manual sleep requested — waiting for game activity");
    },
    stopForNoUnfinishedMatches: () => {
      if (stoppedPermanently || state === "manual-sleep") return;
      stopTimer();
      state = url ? "no-unfinished-matches" : "not-configured";
    },
    shutdown: () => {
      stoppedPermanently = true;
      stopTimer();
      state = "shutdown";
    },
    getStatus: () => ({
      configured: !!url,
      intervalMinutes: Math.round(intervalMs / 60000),
      state,
    }),
  };
}
