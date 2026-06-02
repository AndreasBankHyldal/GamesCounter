"use client";

import { useEffect, useState } from "react";
import { DEFAULT_AVATAR_STYLE, randomSeed, randomStyleKey } from "@/lib/avatar";
import type { AvatarChoice } from "./lobby";

/**
 * Avatar state that starts from a deterministic default (so server and client
 * render the same markup) and randomises only after mount — avoiding hydration
 * mismatches from `Math.random()` during render.
 */
export function useRandomAvatar(): [AvatarChoice, (v: AvatarChoice) => void] {
  const [avatar, setAvatar] = useState<AvatarChoice>({
    styleKey: DEFAULT_AVATAR_STYLE,
    seed: "guest",
  });
  useEffect(() => {
    setAvatar({ styleKey: randomStyleKey(), seed: randomSeed() });
  }, []);
  return [avatar, setAvatar];
}
