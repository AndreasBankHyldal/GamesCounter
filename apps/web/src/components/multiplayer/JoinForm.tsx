"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoom } from "@/lib/multiplayer/lobby";
import { saveIdentity } from "@/lib/multiplayer/identity";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const room = code.trim().toUpperCase();
    const player = name.trim();
    if (room.length < 6 || !player) {
      setError("Enter the 6-character code and your name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { playerID, playerCredentials } = await joinRoom(room, player);
      saveIdentity(room, { playerID, credentials: playerCredentials, name: player });
      router.push(`/play/${room}`);
    } catch {
      setError("Couldn't join — check the code, or the room may be full.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Room code"
        maxLength={6}
        autoCapitalize="characters"
        className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-white placeholder:text-white/30 placeholder:tracking-normal placeholder:text-base"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={20}
        className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
      />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-white/15 px-4 py-3 font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
      >
        {busy ? "Joining…" : "Join room"}
      </button>
    </form>
  );
}
