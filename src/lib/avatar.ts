import { createAvatar } from "@dicebear/core";
import {
  adventurer,
  avataaars,
  bottts,
  funEmoji,
  lorelei,
  personas,
  shapes,
  thumbs,
} from "@dicebear/collection";

type DiceBearStyle = Parameters<typeof createAvatar>[0];

export interface AvatarStyleOption {
  key: string;
  label: string;
  style: DiceBearStyle;
}

/** Curated set of DiceBear styles offered in the picker. */
export const AVATAR_STYLES: AvatarStyleOption[] = [
  { key: "funEmoji", label: "Emoji", style: funEmoji },
  { key: "bottts", label: "Robots", style: bottts },
  { key: "adventurer", label: "Adventurer", style: adventurer },
  { key: "avataaars", label: "Avatar", style: avataaars },
  { key: "lorelei", label: "Lorelei", style: lorelei },
  { key: "personas", label: "Personas", style: personas },
  { key: "thumbs", label: "Thumbs", style: thumbs },
  { key: "shapes", label: "Shapes", style: shapes },
];

export const DEFAULT_AVATAR_STYLE = AVATAR_STYLES[0].key;

const STYLE_BY_KEY = new Map(AVATAR_STYLES.map((s) => [s.key, s]));

/** Build an inline SVG data URI for the given style + seed. */
export function avatarDataUri(styleKey: string, seed: string): string {
  const option = STYLE_BY_KEY.get(styleKey) ?? AVATAR_STYLES[0];
  return createAvatar(option.style, { seed }).toDataUri();
}

/** Short random seed used to vary an avatar's look. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A random style key from the available set. */
export function randomStyleKey(): string {
  return AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)].key;
}
