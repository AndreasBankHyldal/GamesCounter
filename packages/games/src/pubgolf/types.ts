export type PlayerID = string;

/** Kind of stop on the crawl. Only `bar` stops are scored (sips + challenge). */
export type StopType = "bar" | "food" | "pee" | "other";

/** A single stop on the course: a scored bar/hole, or a food/pee/other marker. */
export interface Stop {
  id: string;
  type: StopType;
  name: string;
  /** Position in the course (0-based, kept in sync with array order). */
  order: number;
  /** What you drink at this hole, e.g. "Øl", "Shots", "Drink" (bars only). */
  drink?: string;
  /** Challenge description for this bar (bars only). */
  challenge?: string;
  /** Free-form note (any stop). */
  note?: string;
  /** Bar flagged as one of the designated pee holes (see rules). */
  isPeeHole?: boolean;
}

/** One player's recorded result at a single bar. */
export interface HoleScore {
  /** Sips taken — these are the points for this hole (fewer is better). */
  sips?: number;
  /** Manual +/- adjustment from the bar's challenge. */
  challengeDelta?: number;
}

/** A rule in the (editable) rule book that can be applied to a player. */
export interface Rule {
  id: string;
  text: string;
  /** Point change (golf: + hurts, - helps). Ignored when `disqualifies`. */
  delta: number;
  /** Rule disqualifies the player instead of adjusting points. */
  disqualifies?: boolean;
}

/** A rule applied to a specific player during the night. */
export interface PenaltyApplication {
  id: string;
  /** The rule this came from, if any (one-off penalties may omit it). */
  ruleId?: string;
  playerID: PlayerID;
  /** Snapshot of the rule text at apply time (rules may later be edited/removed). */
  text: string;
  delta: number;
  disqualifies?: boolean;
  /** Client-supplied timestamp (kept deterministic by passing it as a move arg). */
  createdAt: number;
}

/** A payment somebody made during the night (simple shared ledger). */
export interface Payment {
  id: string;
  payerId: PlayerID;
  /** Amount paid. */
  amount: number;
  note?: string;
  /** Client-supplied timestamp (passed as a move arg to stay deterministic). */
  createdAt: number;
}

export type PubgolfPhase = "playing" | "finished";

export interface PubgolfState {
  phase: PubgolfPhase;
  /** Ordered course of stops (bars + food/pee/other markers). */
  stops: Stop[];
  /** scores[stopId][playerID] = HoleScore. */
  scores: Record<string, Record<PlayerID, HoleScore>>;
  /** Editable rule book, seeded with the default Danish rule set. */
  rules: Rule[];
  /** Rules applied to players over the course of the night. */
  penalties: PenaltyApplication[];
  /** Money ledger. */
  payments: Payment[];
  /** The stop the group is currently on (UI highlight). */
  currentStopId: string | null;
  /** Monotonic counter used to mint deterministic entity ids. */
  nextSeq: number;
  /** Lightweight activity log, newest last. `@@id@@` = player-name token. */
  log: string[];
}

/** Pubgolf takes no match options — every game seeds the same default crawl. */
export type PubgolfSetupData = Record<string, never>;
