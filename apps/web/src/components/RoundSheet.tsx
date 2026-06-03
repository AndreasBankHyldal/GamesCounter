"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/players";
import { Avatar } from "./Avatar";

export function RoundSheet({
  players,
  title,
  subtitle,
  hint,
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  players: Player[];
  title: string;
  subtitle?: string;
  hint?: string;
  initial: Record<string, number>;
  onSave: (scores: Record<string, number>) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      players.map((p) => [p.id, p.id in initial ? String(initial[p.id]) : ""])
    )
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Phones show a numeric keypad with no minus key, so a tap-toggle is the
  // reliable way to enter a negative score.
  const toggleSign = (id: string) =>
    setValues((prev) => {
      const raw = (prev[id] ?? "").trim();
      if (raw === "" || raw === "-") return { ...prev, [id]: "-" };
      const next = raw.startsWith("-") ? raw.slice(1) : `-${raw}`;
      return { ...prev, [id]: next };
    });

  const save = () => {
    const scores: Record<string, number> = {};
    for (const p of players) {
      const raw = (values[p.id] ?? "").trim();
      const n = raw === "" ? 0 : Math.round(Number(raw));
      scores[p.id] = Number.isFinite(n) ? n : 0;
    }
    onSave(scores);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl border border-white/15 bg-felt-edge p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-center">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
        </div>
        {hint && (
          <p className="mb-2 text-center text-xs text-white/40">{hint}</p>
        )}

        <div className="-mx-1 flex-1 overflow-y-auto px-1 py-2">
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-2"
              >
                <Avatar
                  styleKey={p.avatarStyle}
                  seed={p.avatarSeed}
                  size={36}
                  className="rounded-full"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-white">
                  {p.name}
                </span>
                {(() => {
                  const isNeg = (values[p.id] ?? "").trim().startsWith("-");
                  return (
                    <button
                      type="button"
                      onClick={() => toggleSign(p.id)}
                      aria-pressed={isNeg}
                      aria-label={
                        isNeg ? `Make ${p.name}'s score positive` : `Make ${p.name}'s score negative`
                      }
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-2xl font-bold leading-none transition ${
                        isNeg
                          ? "border-card-red-light bg-card-red/30 text-white"
                          : "border-white/15 bg-white/10 text-white/60 hover:text-white"
                      }`}
                    >
                      {isNeg ? "−" : "+"}
                    </button>
                  );
                })()}
                <input
                  type="number"
                  inputMode="numeric"
                  value={values[p.id]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  placeholder="0"
                  className="w-20 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-right text-lg font-semibold text-white placeholder:text-white/30 focus:border-card-red-light focus:outline-none"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl px-4 py-2.5 text-sm font-medium text-white/70 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="game-card rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
