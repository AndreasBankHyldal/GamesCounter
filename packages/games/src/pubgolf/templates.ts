import type { Stop } from "./types";

/** A stop in the default crawl, without the runtime `id`/`order`. */
export type PresetStop = Omit<Stop, "id" | "order">;

/**
 * The single built-in pub crawl, seeded into every game. Rename the bars,
 * add/remove/reorder stops and set the sips at any time — even after the game
 * has started. There is no par: the sips you take at each bar are your points,
 * and the lowest total wins. Holes 3, 6 and 9 are the designated pee holes.
 */
export const DEFAULT_CRAWL: PresetStop[] = [
  { type: "bar", name: "Vinstuen", drink: "Øl", challenge: "Drik med din ikke-dominante hånd" },
  { type: "bar", name: "Freddie's", drink: "Øl" },
  {
    type: "bar",
    name: "Freddie's",
    drink: "Shots",
    challenge: "2 shots hver (uden hænder)",
    isPeeHole: true,
  },
  { type: "bar", name: "Mundheld", drink: "Øl" },
  { type: "bar", name: "Jojo", drink: "Drink", challenge: "No phones!" },
  { type: "food", name: "Burger Boom", note: "Spis · Vandhul", isPeeHole: true },
  { type: "bar", name: "Wacksies", drink: "Øl", challenge: "Bestil uden at sige noget" },
  {
    type: "bar",
    name: "Sherlock Holmes Pub",
    drink: "Øl",
    challenge: "Man må ikke omtale de andre ved deres rigtige navn",
  },
  { type: "bar", name: "Cross Café", drink: "Drink", isPeeHole: true },
];
