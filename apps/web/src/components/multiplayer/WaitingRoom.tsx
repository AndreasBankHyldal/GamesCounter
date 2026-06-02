"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  type RoomInfo,
} from "@/lib/multiplayer/lobby";
import {
  clearIdentity,
  loadIdentity,
  saveIdentity,
  type Identity,
} from "@/lib/multiplayer/identity";
import { Avatar } from "@/components/Avatar";
import { useRandomAvatar } from "@/lib/multiplayer/useRandomAvatar";
import { AvatarField } from "./AvatarField";

export function WaitingRoom({ code }: { code: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useRandomAvatar();
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [starting, setStarting] = useState(false);
  const navigated = useRef(false);

  // Load any saved identity for this room after mount.
  useEffect(() => {
    setIdentity(loadIdentity(code));
    setHydrated(true);
  }, [code]);

  const refresh = useCallback(async () => {
    try {
      setRoom(await getRoom(code));
      setError((e) => (e === "Room not found — it may have expired." ? null : e));
    } catch {
      setError("Room not found — it may have expired.");
    }
  }, [code]);

  // Poll the room metadata while waiting.
  useEffect(() => {
    if (!hydrated) return;
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [hydrated, refresh]);

  // When the host has started, everyone advances to the table together.
  const started = room?.players.find((p) => p.id === 0)?.data?.started === true;
  useEffect(() => {
    if (started && identity && !navigated.current) {
      navigated.current = true;
      router.replace(`/play/${code}/table`);
    }
  }, [started, identity, code, router]);

  async function joinHere(e: React.FormEvent) {
    e.preventDefault();
    const player = name.trim();
    if (!player) return setError("Enter your name.");
    try {
      const { playerID, playerCredentials } = await joinRoom(code, player, avatar);
      const id: Identity = {
        playerID,
        credentials: playerCredentials,
        name: player,
        avatarStyle: avatar.styleKey,
        avatarSeed: avatar.seed,
      };
      saveIdentity(code, id);
      setIdentity(id);
      setError(null);
    } catch {
      setError("Couldn't join — the room may be full.");
    }
  }

  async function start() {
    if (!identity) return;
    setStarting(true);
    try {
      const ownAvatar =
        identity.avatarStyle && identity.avatarSeed
          ? { styleKey: identity.avatarStyle, seed: identity.avatarSeed }
          : undefined;
      await startRoom(code, identity.playerID, identity.credentials, ownAvatar);
      router.replace(`/play/${code}/table`);
    } catch {
      setError("Couldn't start the game.");
      setStarting(false);
    }
  }

  async function leave() {
    if (identity) {
      try {
        await leaveRoom(code, identity.playerID, identity.credentials);
      } catch {
        /* ignore */
      }
      clearIdentity(code);
    }
    router.replace("/play");
  }

  if (!hydrated) return null;

  // Visited the link without joining yet → inline join form.
  if (!identity) {
    return (
      <main className="felt flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-2 text-center text-2xl font-bold text-white">Join room</h1>
          <p className="mb-6 text-center text-3xl font-bold tracking-[0.3em] text-amber-300">
            {code}
          </p>
          <form onSubmit={joinHere} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <AvatarField value={avatar} onChange={setAvatar} size={56} />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={20}
                className="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
              />
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button
              type="submit"
              className="rounded-xl bg-white/15 px-4 py-3 font-semibold text-white hover:bg-white/25"
            >
              Join
            </button>
          </form>
        </div>
      </main>
    );
  }

  const seats = room?.players ?? [];
  const filled = seats.filter((p) => p.name).length;
  const total = seats.length;
  const isHost = identity.playerID === "0";
  const canStart = isHost && filled === total && total >= 2;

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-12">
      <header className="mb-8 flex w-full max-w-md items-center gap-3">
        <button
          onClick={leave}
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Leave"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-white">Waiting room</h1>
      </header>

      <section className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-white/50">Room code</p>
          <p className="my-2 text-4xl font-bold tracking-[0.3em] text-amber-300">{code}</p>
          <p className="text-sm text-white/60">Share this code with your friends.</p>
        </div>

        <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-widest text-white/50">
          Players ({filled}/{total})
        </h2>
        <ul className="flex flex-col gap-2">
          {seats.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="flex items-center gap-3 font-semibold text-white">
                {p.data?.avatarStyle && p.data?.avatarSeed ? (
                  <Avatar
                    styleKey={p.data.avatarStyle}
                    seed={p.data.avatarSeed}
                    size={32}
                    className="rounded-full"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-white/15" aria-hidden />
                )}
                {p.name ?? <span className="text-white/40">Empty seat</span>}
              </span>
              <span className="text-xs text-white/50">
                {p.id === 0 && "host · "}
                {String(p.id) === identity.playerID ? "you" : p.name ? "ready" : "…"}
              </span>
            </li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

        <div className="mt-6">
          {isHost ? (
            <button
              type="button"
              onClick={start}
              disabled={!canStart || starting}
              className="game-card w-full rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
            >
              {starting
                ? "Starting…"
                : canStart
                  ? "Start game"
                  : `Waiting for ${total - filled} more…`}
            </button>
          ) : (
            <p className="text-center text-sm text-white/60">
              Waiting for the host to start…
            </p>
          )}
        </div>

        <Link
          href="/play"
          className="mt-4 block text-center text-sm text-white/40 hover:text-white/70"
        >
          Leave room
        </Link>
      </section>
    </main>
  );
}
