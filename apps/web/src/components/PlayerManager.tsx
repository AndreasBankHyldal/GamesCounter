"use client";

import { useState, type ReactNode } from "react";
import { createPlayer, type Player } from "@/lib/players";
import { Avatar } from "./Avatar";
import { AvatarPicker } from "./AvatarPicker";

export function PlayerManager({
  onStart,
  belowPlayers,
}: {
  /** Called with the finalised roster when the user starts the game. */
  onStart: (players: Player[]) => void;
  /** Optional per-game config rendered just above the Start button. */
  belowPlayers?: (players: Player[]) => ReactNode;
}) {
  // Players are intentionally not persisted — each new game starts blank.
  const [players, setPlayers] = useState<Player[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const addPlayer = () => {
    const player = createPlayer("");
    setPlayers((prev) => [...prev, player]);
    setLastAddedId(player.id);
  };

  const updatePlayer = (id: string, patch: Partial<Player>) =>
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const removePlayer = (id: string) =>
    setPlayers((prev) => prev.filter((p) => p.id !== id));

  const editingPlayer = players.find((p) => p.id === editingId) ?? null;

  const canStart = players.length >= 2;
  const start = () => {
    if (!canStart) return;
    onStart(
      players.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}` }))
    );
  };

  return (
    <section className="w-full max-w-md">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
          Players
        </h2>
        {players.length > 0 && (
          <span className="text-sm text-white/40">{players.length}</span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2 pr-3"
          >
            <button
              type="button"
              onClick={() => setEditingId(player.id)}
              className="shrink-0 rounded-full bg-white/10 p-1 transition hover:bg-white/20"
              aria-label={`Change ${player.name || "player"} avatar`}
            >
              <Avatar
                styleKey={player.avatarStyle}
                seed={player.avatarSeed}
                size={44}
                className="rounded-full"
              />
            </button>
            <input
              value={player.name}
              autoFocus={player.id === lastAddedId}
              onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
              placeholder="Name"
              className="min-w-0 flex-1 bg-transparent text-lg font-medium text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removePlayer(player.id)}
              className="shrink-0 rounded-full px-2 text-xl text-white/40 transition hover:text-white"
              aria-label={`Remove ${player.name || "player"}`}
            >
              ×
            </button>
          </li>
        ))}

        {/* Add box — sits below the players; click to append a blank player */}
        <li>
          <button
            type="button"
            onClick={addPlayer}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/20 p-2 pr-3 text-left transition hover:border-white/40 hover:bg-white/5"
          >
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-card-red text-2xl font-light text-white">
              +
            </span>
            <span className="text-lg font-medium text-white/50">
              Add player…
            </span>
          </button>
        </li>
      </ul>

      <p className="mt-3 text-center text-xs text-white/40">
        Tap an avatar to change its look.
      </p>

      {belowPlayers?.(players)}

      <button
        type="button"
        onClick={start}
        disabled={!canStart}
        className="game-card mt-6 w-full rounded-2xl py-4 text-lg font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start game
      </button>
      {!canStart && (
        <p className="mt-2 text-center text-xs text-white/40">
          Add at least 2 players to start.
        </p>
      )}

      {editingPlayer && (
        <AvatarPicker
          initialStyle={editingPlayer.avatarStyle}
          initialSeed={editingPlayer.avatarSeed}
          onClose={(selection) => {
            updatePlayer(editingPlayer.id, {
              avatarStyle: selection.styleKey,
              avatarSeed: selection.seed,
            });
            setEditingId(null);
          }}
        />
      )}
    </section>
  );
}
