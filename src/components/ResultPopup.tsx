"use client";

import { useEffect } from "react";
import type { Player } from "@/lib/players";
import { Avatar } from "./Avatar";

export function ResultPopup({
  emoji,
  title,
  caption,
  players,
  highlightIds,
  onClose,
}: {
  emoji: string;
  title: string;
  caption: string;
  players: Player[];
  highlightIds: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const highlighted = players.filter((p) => highlightIds.includes(p.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-xs rounded-3xl border border-card-red-light bg-felt-edge p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">{emoji}</div>
        <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>

        <div className="mt-4 flex flex-wrap justify-center gap-4">
          {highlighted.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar
                styleKey={p.avatarStyle}
                seed={p.avatarSeed}
                size={64}
                className="rounded-full ring-2 ring-card-red-light"
              />
              <span className="max-w-20 truncate text-sm font-semibold text-white">
                {p.name}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-white/60">{caption}</p>

        <button
          type="button"
          onClick={onClose}
          className="game-card mt-5 w-full rounded-xl py-3 font-semibold text-white"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
