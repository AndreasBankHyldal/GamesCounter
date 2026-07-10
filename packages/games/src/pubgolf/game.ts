import type { Game, MoveFn } from "boardgame.io";
import { INVALID_MOVE, Stage } from "boardgame.io/core";
import { DEFAULT_CRAWL, type PresetStop } from "./templates";
import type {
  HoleScore,
  Payment,
  PenaltyApplication,
  PlayerID,
  PubgolfSetupData,
  PubgolfState,
  Rule,
  Stop,
  StopType,
} from "./types";

/**
 * The default Danish pubgolf rule book, seeded into every match (editable).
 * Golf scoring: a positive delta hurts, a negative delta helps. The fight rule
 * disqualifies instead of adjusting points.
 */
export const DEFAULT_RULES: ReadonlyArray<Omit<Rule, "id">> = [
  { text: "Hvis du spilder udover dig selv", delta: 1 },
  { text: "Du bliver disket, hvis du kommer op at slås med nogen", delta: 0, disqualifies: true },
  { text: "Hvis man er fysisk over for hinanden", delta: 2 },
  { text: "Hvis man falder", delta: 1 },
  { text: "3 huller udnævnes som pishuller. Hvis du tisser uden for disse", delta: 1 },
  { text: "Hvis man fejler et hul", delta: 1 },
  { text: "Hvis man klager om vejret", delta: 1 },
  { text: "Hvis man hjælper en sjæl i nød", delta: -1 },
];

const STOP_TYPES: StopType[] = ["bar", "food", "pee", "other"];

function tag(pid: PlayerID): string {
  return `@@${pid}@@`;
}

/** Mint a deterministic, globally-unique id (safe under optimistic replay). */
function mintId(G: PubgolfState, prefix: string): string {
  const id = `${prefix}-${G.nextSeq}`;
  G.nextSeq += 1;
  return id;
}

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Normalise a par value: a non-negative integer, or `undefined` when unset/0
 * (par 0 means "no par", so points equal sips). Rejects negatives/NaN.
 */
function parValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n > 0 ? n : undefined;
}

/**
 * Turn a list of preset stops into concrete `Stop`s with ids/order, seeding a
 * fresh score bucket for each bar. Returns the next free sequence number so
 * callers keep minting unique ids afterwards.
 */
function seedStops(
  presetStops: PresetStop[],
  startSeq: number
): {
  stops: Stop[];
  scores: Record<string, Record<PlayerID, HoleScore>>;
  nextSeq: number;
} {
  const stops: Stop[] = [];
  const scores: Record<string, Record<PlayerID, HoleScore>> = {};
  let seq = startSeq;
  presetStops.forEach((s, i) => {
    const id = `stop-${seq}`;
    seq += 1;
    const stop: Stop = { id, order: i, type: s.type, name: s.name };
    if (s.type === "bar") {
      if (s.drink) stop.drink = s.drink;
      if (s.challenge) stop.challenge = s.challenge;
      const par = parValue(s.par);
      if (par !== undefined) stop.par = par;
    }
    if (s.isPeeHole) stop.isPeeHole = true;
    if (s.note) stop.note = s.note;
    stops.push(stop);
    if (s.type === "bar") scores[id] = {};
  });
  return { stops, scores, nextSeq: seq };
}

// ─── Course moves ────────────────────────────────────────────────────────────

interface AddStopInput {
  type: StopType;
  name: string;
  drink?: string;
  par?: number;
  challenge?: string;
  note?: string;
  isPeeHole?: boolean;
}

const addStop: MoveFn<PubgolfState> = ({ G }, input: AddStopInput) => {
  const name = trimmed(input?.name);
  if (!name) return INVALID_MOVE;
  const type: StopType = STOP_TYPES.includes(input.type) ? input.type : "bar";

  const stop: Stop = { id: mintId(G, "stop"), type, name, order: G.stops.length };
  if (type === "bar") {
    const drink = trimmed(input.drink);
    if (drink) stop.drink = drink;
    const par = parValue(input.par);
    if (par !== undefined) stop.par = par;
    const challenge = trimmed(input.challenge);
    if (challenge) stop.challenge = challenge;
    if (input.isPeeHole) stop.isPeeHole = true;
  }
  const note = trimmed(input.note);
  if (note) stop.note = note;

  G.stops.push(stop);
  if (type === "bar") G.scores[stop.id] = {};
};

type StopPatch = Partial<Omit<Stop, "id" | "order">>;

const updateStop: MoveFn<PubgolfState> = ({ G }, id: string, patch: StopPatch) => {
  const stop = G.stops.find((s) => s.id === id);
  if (!stop || !patch) return INVALID_MOVE;

  if (patch.name !== undefined) {
    const name = trimmed(patch.name);
    if (!name) return INVALID_MOVE;
    stop.name = name;
  }
  if (patch.type !== undefined && STOP_TYPES.includes(patch.type)) stop.type = patch.type;
  if ("drink" in patch) stop.drink = trimmed(patch.drink);
  if ("par" in patch) stop.par = parValue(patch.par);
  if ("challenge" in patch) stop.challenge = trimmed(patch.challenge);
  if ("note" in patch) stop.note = trimmed(patch.note);
  if ("isPeeHole" in patch) stop.isPeeHole = patch.isPeeHole ? true : undefined;
};

const removeStop: MoveFn<PubgolfState> = ({ G }, id: string) => {
  const idx = G.stops.findIndex((s) => s.id === id);
  if (idx === -1) return INVALID_MOVE;
  G.stops.splice(idx, 1);
  delete G.scores[id];
  G.stops.forEach((s, i) => {
    s.order = i;
  });
  if (G.currentStopId === id) G.currentStopId = null;
};

const reorderStops: MoveFn<PubgolfState> = ({ G }, orderedIds: string[]) => {
  if (!Array.isArray(orderedIds) || orderedIds.length !== G.stops.length) return INVALID_MOVE;
  const byId = new Map(G.stops.map((s) => [s.id, s]));
  const next: Stop[] = [];
  for (const id of orderedIds) {
    const stop = byId.get(id);
    if (!stop || next.includes(stop)) return INVALID_MOVE;
    next.push(stop);
  }
  next.forEach((s, i) => {
    s.order = i;
  });
  G.stops = next;
};

const setCurrentStop: MoveFn<PubgolfState> = ({ G }, id: string | null) => {
  if (id !== null && !G.stops.some((s) => s.id === id)) return INVALID_MOVE;
  G.currentStopId = id;
};

// ─── Scoring moves ───────────────────────────────────────────────────────────

function cellFor(G: PubgolfState, stopId: string, playerID: PlayerID): HoleScore | null {
  const stop = G.stops.find((s) => s.id === stopId);
  if (!stop || stop.type !== "bar") return null;
  if (!G.scores[stopId]) G.scores[stopId] = {};
  const cell = G.scores[stopId];
  if (!cell[playerID]) cell[playerID] = {};
  return cell[playerID];
}

const setSips: MoveFn<PubgolfState> = (
  { G },
  stopId: string,
  playerID: PlayerID,
  sips: number | null
) => {
  const entry = cellFor(G, stopId, playerID);
  if (!entry) return INVALID_MOVE;
  if (sips === null || sips === undefined) {
    entry.sips = undefined;
  } else if (typeof sips === "number" && sips >= 0 && Number.isFinite(sips)) {
    entry.sips = Math.floor(sips);
  } else {
    return INVALID_MOVE;
  }
};

const setChallengeDelta: MoveFn<PubgolfState> = (
  { G },
  stopId: string,
  playerID: PlayerID,
  delta: number | null
) => {
  const entry = cellFor(G, stopId, playerID);
  if (!entry) return INVALID_MOVE;
  if (delta === null || delta === undefined) {
    entry.challengeDelta = undefined;
  } else if (typeof delta === "number" && Number.isFinite(delta)) {
    entry.challengeDelta = Math.trunc(delta);
  } else {
    return INVALID_MOVE;
  }
};

// ─── Rule moves ──────────────────────────────────────────────────────────────

interface RuleInput {
  text: string;
  delta?: number;
  disqualifies?: boolean;
}

const addRule: MoveFn<PubgolfState> = ({ G }, input: RuleInput) => {
  const text = trimmed(input?.text);
  if (!text) return INVALID_MOVE;
  const rule: Rule = {
    id: mintId(G, "rule"),
    text,
    delta: input.disqualifies
      ? 0
      : typeof input.delta === "number" && Number.isFinite(input.delta)
        ? Math.trunc(input.delta)
        : 0,
  };
  if (input.disqualifies) rule.disqualifies = true;
  G.rules.push(rule);
};

const updateRule: MoveFn<PubgolfState> = ({ G }, id: string, patch: Partial<RuleInput>) => {
  const rule = G.rules.find((r) => r.id === id);
  if (!rule || !patch) return INVALID_MOVE;
  if (patch.text !== undefined) {
    const text = trimmed(patch.text);
    if (!text) return INVALID_MOVE;
    rule.text = text;
  }
  if ("disqualifies" in patch) {
    rule.disqualifies = patch.disqualifies ? true : undefined;
    if (rule.disqualifies) rule.delta = 0;
  }
  if (patch.delta !== undefined && !rule.disqualifies) {
    if (typeof patch.delta !== "number" || !Number.isFinite(patch.delta)) return INVALID_MOVE;
    rule.delta = Math.trunc(patch.delta);
  }
};

const removeRule: MoveFn<PubgolfState> = ({ G }, id: string) => {
  const idx = G.rules.findIndex((r) => r.id === id);
  if (idx === -1) return INVALID_MOVE;
  G.rules.splice(idx, 1);
};

interface PenaltyInput {
  playerID: PlayerID;
  ruleId?: string;
  delta?: number;
  disqualifies?: boolean;
  text?: string;
  at?: number;
}

const applyPenalty: MoveFn<PubgolfState> = ({ G }, input: PenaltyInput) => {
  if (!input || typeof input.playerID !== "string") return INVALID_MOVE;

  let text = trimmed(input.text) ?? "";
  let delta = 0;
  let disqualifies = !!input.disqualifies;

  if (input.ruleId) {
    const rule = G.rules.find((r) => r.id === input.ruleId);
    if (!rule) return INVALID_MOVE;
    text = text || rule.text;
    disqualifies = disqualifies || !!rule.disqualifies;
    delta = disqualifies ? 0 : rule.delta;
  } else {
    if (!text) return INVALID_MOVE;
    delta =
      disqualifies || typeof input.delta !== "number" || !Number.isFinite(input.delta)
        ? 0
        : Math.trunc(input.delta);
  }

  const penalty: PenaltyApplication = {
    id: mintId(G, "pen"),
    playerID: input.playerID,
    text,
    delta,
    createdAt: typeof input.at === "number" ? input.at : 0,
  };
  if (input.ruleId) penalty.ruleId = input.ruleId;
  if (disqualifies) penalty.disqualifies = true;
  G.penalties.push(penalty);

  G.log.push(
    disqualifies
      ? `${tag(input.playerID)} disqualified: ${text}`
      : `${tag(input.playerID)} ${delta >= 0 ? "+" : ""}${delta}: ${text}`
  );
};

const removePenalty: MoveFn<PubgolfState> = ({ G }, id: string) => {
  const idx = G.penalties.findIndex((p) => p.id === id);
  if (idx === -1) return INVALID_MOVE;
  G.penalties.splice(idx, 1);
};

// ─── Payment moves ───────────────────────────────────────────────────────────

interface PaymentInput {
  payerId: PlayerID;
  amount: number;
  note?: string;
  at?: number;
}

const addPayment: MoveFn<PubgolfState> = ({ G }, input: PaymentInput) => {
  if (!input || typeof input.payerId !== "string") return INVALID_MOVE;
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
    return INVALID_MOVE;
  }
  const payment: Payment = {
    id: mintId(G, "pay"),
    payerId: input.payerId,
    amount: Math.round(input.amount * 100) / 100,
    createdAt: typeof input.at === "number" ? input.at : 0,
  };
  const note = trimmed(input.note);
  if (note) payment.note = note;
  G.payments.push(payment);
};

const updatePayment: MoveFn<PubgolfState> = (
  { G },
  id: string,
  patch: Partial<Omit<PaymentInput, "at">>
) => {
  const payment = G.payments.find((p) => p.id === id);
  if (!payment || !patch) return INVALID_MOVE;
  if (patch.payerId !== undefined) {
    if (typeof patch.payerId !== "string") return INVALID_MOVE;
    payment.payerId = patch.payerId;
  }
  if (patch.amount !== undefined) {
    if (typeof patch.amount !== "number" || !Number.isFinite(patch.amount) || patch.amount <= 0) {
      return INVALID_MOVE;
    }
    payment.amount = Math.round(patch.amount * 100) / 100;
  }
  if ("note" in patch) payment.note = trimmed(patch.note);
};

const removePayment: MoveFn<PubgolfState> = ({ G }, id: string) => {
  const idx = G.payments.findIndex((p) => p.id === id);
  if (idx === -1) return INVALID_MOVE;
  G.payments.splice(idx, 1);
};

// ─── Flow moves ──────────────────────────────────────────────────────────────

const finishNight: MoveFn<PubgolfState> = ({ G }) => {
  if (G.phase !== "playing") return INVALID_MOVE;
  G.phase = "finished";
  G.log.push("The night is over — final scores are in!");
};

const reopenNight: MoveFn<PubgolfState> = ({ G }) => {
  if (G.phase !== "finished") return INVALID_MOVE;
  G.phase = "playing";
  G.log.push("Back to the crawl!");
};

// ─── Game ────────────────────────────────────────────────────────────────────

/**
 * Pubgolf is a shared, turn-free scoreboard: every seated player is always
 * active and may run any move at any time (equal rights). There is no hidden
 * state and no randomness, so no `playerView`/`random` are needed. Every game
 * starts already in `playing` with the default crawl seeded (editable live);
 * `finishNight`/`reopenNight` toggle the `finished` results state.
 */
export const Pubgolf: Game<PubgolfState, Record<string, unknown>, PubgolfSetupData> = {
  name: "pubgolf",
  minPlayers: 1,
  maxPlayers: 12,

  setup: (): PubgolfState => {
    const rules = DEFAULT_RULES.map((rule, i) => ({ id: `rule-${i}`, ...rule }));
    const seeded = seedStops(DEFAULT_CRAWL, rules.length);
    const firstBar = seeded.stops.find((s) => s.type === "bar");
    return {
      phase: "playing",
      stops: seeded.stops,
      scores: seeded.scores,
      rules,
      penalties: [],
      payments: [],
      currentStopId: firstBar ? firstBar.id : null,
      nextSeq: seeded.nextSeq,
      log: ["Pubgolf — first to the lowest score wins. Edit the course any time."],
    };
  },

  moves: {
    addStop,
    updateStop,
    removeStop,
    reorderStops,
    setCurrentStop,
    setSips,
    setChallengeDelta,
    addRule,
    updateRule,
    removeRule,
    applyPenalty,
    removePenalty,
    addPayment,
    updatePayment,
    removePayment,
    finishNight,
    reopenNight,
  },

  // Everyone is active for the whole game; no move ever ends the turn.
  turn: {
    activePlayers: { all: Stage.NULL },
  },
};
