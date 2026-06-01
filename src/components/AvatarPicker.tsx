"use client";

import { useCallback, useEffect, useState } from "react";
import { AVATAR_STYLES, randomSeed, randomStyleKey } from "@/lib/avatar";
import { Avatar } from "./Avatar";

const GRID_SIZE = 12;

function freshSeeds(first?: string): string[] {
  const seeds = first ? [first] : [];
  while (seeds.length < GRID_SIZE) seeds.push(randomSeed());
  return seeds;
}

export function AvatarPicker({
  initialStyle,
  initialSeed,
  onClose,
}: {
  initialStyle: string;
  initialSeed: string;
  /** Called when the picker closes; receives the chosen avatar to save. */
  onClose: (selection: { styleKey: string; seed: string }) => void;
}) {
  const [styleKey, setStyleKey] = useState(initialStyle);
  const [seeds, setSeeds] = useState<string[]>(() => freshSeeds(initialSeed));
  const [selectedSeed, setSelectedSeed] = useState(initialSeed);

  // Closing (click outside / Escape) saves the current selection.
  const commit = useCallback(
    () => onClose({ styleKey, seed: selectedSeed }),
    [onClose, styleKey, selectedSeed]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") commit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit]);

  // Pick a completely random avatar from all available styles.
  const pickRandom = () => {
    const seed = randomSeed();
    setStyleKey(randomStyleKey());
    setSeeds(freshSeeds(seed));
    setSelectedSeed(seed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={commit}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/15 bg-felt-edge p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview + random */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-2">
              <Avatar
                styleKey={styleKey}
                seed={selectedSeed}
                size={88}
                className="rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={pickRandom}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white transition hover:bg-white/10"
              aria-label="Pick a random avatar from all styles"
            >
              <span className="text-2xl">🎲</span>
              <span className="text-xs font-medium">Random</span>
            </button>
          </div>
          <p className="text-sm font-medium text-white/70">Choose an avatar</p>
        </div>

        {/* Style chips */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {AVATAR_STYLES.map((s) => {
            const active = s.key === styleKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStyleKey(s.key)}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
                  active
                    ? "border-card-red-light bg-card-red/30"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
                aria-pressed={active}
              >
                <Avatar
                  styleKey={s.key}
                  seed={selectedSeed}
                  size={36}
                  className="rounded-lg"
                />
                <span className="text-[10px] text-white/60">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Options grid */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {seeds.map((seed) => {
            const active = seed === selectedSeed;
            return (
              <button
                key={seed}
                type="button"
                onClick={() => setSelectedSeed(seed)}
                className={`rounded-xl border-2 p-1 transition ${
                  active
                    ? "border-card-red-light bg-white/15"
                    : "border-transparent bg-white/5 hover:bg-white/10"
                }`}
                aria-pressed={active}
              >
                <Avatar
                  styleKey={styleKey}
                  seed={seed}
                  size={56}
                  className="mx-auto rounded-lg"
                />
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSeeds(freshSeeds())}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            ↻ Shuffle
          </button>
          <span className="text-xs text-white/40">Tap outside to save</span>
        </div>
      </div>
    </div>
  );
}
