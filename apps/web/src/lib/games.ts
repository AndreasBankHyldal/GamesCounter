export type Suit = "spade" | "heart" | "diamond" | "club";

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

export const SUIT_COLOR: Record<Suit, "red" | "black"> = {
  spade: "black",
  club: "black",
  heart: "red",
  diamond: "red",
};

export interface Game {
  /** URL slug, e.g. /games/500 */
  slug: string;
  /** Display name */
  name: string;
  /** Short description shown under the name */
  tagline: string;
  /** Suit used for the card decoration */
  suit: Suit;
}

export const games: Game[] = [
  {
    slug: "500",
    name: "500",
    tagline: "Bidding & trick-taking",
    suit: "spade",
  },
  {
    slug: "piratbridge",
    name: "Piratbridge",
    tagline: "Pirate Bridge",
    suit: "diamond",
  },
  {
    slug: "gabong",
    name: "Gabong",
    tagline: "Family card game",
    suit: "club",
  },
  {
    slug: "jonas-spil",
    name: "Jona's spil",
    tagline: "First to the limit loses",
    suit: "heart",
  },
];

export function getGame(slug: string): Game | undefined {
  return games.find((game) => game.slug === slug);
}
