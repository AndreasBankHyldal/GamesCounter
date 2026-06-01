"use client";

import { useEffect } from "react";
import type { HundredHit } from "@/lib/scoring";
import type { Player } from "@/lib/players";
import { Avatar } from "./Avatar";

export function HundredPopup({
  hits,
  players,
  onClose,
}: {
  hits: HundredHit[];
  players: Player[];
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const playerById = (id: string) => players.find((p) => p.id === id);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-5"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto w-full max-w-sm animate-pop rounded-2xl border border-card-red-light bg-felt-edge/95 px-5 py-4 text-center shadow-2xl backdrop-blur"
      >
        <p className="text-lg font-bold text-white">🎯 Clean hundred!</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {hits.map((hit) => {
            const player = playerById(hit.playerId);
            return (
              <li
                key={hit.playerId}
                className="flex items-center justify-center gap-2 text-sm text-white/90"
              >
                {player && (
                  <Avatar
                    styleKey={player.avatarStyle}
                    seed={player.avatarSeed}
                    size={22}
                    className="rounded-full"
                  />
                )}
                <span className="font-semibold">{player?.name ?? "?"}</span>
                <span className="text-white/60">
                  hit {hit.landedOn} → halved to {hit.halvedTo}
                </span>
              </li>
            );
          })}
        </ul>
      </button>
    </div>
  );
}
