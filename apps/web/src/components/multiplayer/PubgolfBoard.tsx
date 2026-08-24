"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardProps } from "boardgame.io/react";
import {
  computeStandings,
  paymentTotals,
  type PubgolfState,
  type StopType,
} from "@gamescounter/games";
import { Avatar } from "@/components/Avatar";
import { getRoom } from "@/lib/multiplayer/lobby";
import { clearIdentity } from "@/lib/multiplayer/identity";

type Props = BoardProps<PubgolfState>;

type Tab = "course" | "scores" | "rules" | "payments";

const STOP_META: Record<StopType, { icon: string; label: string }> = {
  bar: { icon: "🍺", label: "Bar" },
  food: { icon: "🍔", label: "Food" },
  pee: { icon: "🚻", label: "Pee stop" },
  other: { icon: "📍", label: "Stop" },
};

const STOP_ORDER: StopType[] = ["bar", "food", "other"];

// ─── Small building blocks ─────────────────────────────────────────────────────

function Stepper({
  value,
  onDec,
  onInc,
  dim,
  label,
}: {
  value: string | number;
  onDec: () => void;
  onInc: () => void;
  dim?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDec}
        aria-label={label ? `${label} down` : "Decrease"}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20 active:scale-95"
      >
        −
      </button>
      <span
        className={`w-9 text-center text-xl font-bold tabular-nums ${dim ? "text-white/30" : "text-white"}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label={label ? `${label} up` : "Increase"}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20 active:scale-95"
      >
        +
      </button>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${className}`}>{children}</div>
  );
}

/** Colour a golf delta: positive is bad (red), negative is good (green). */
function deltaClass(n: number): string {
  if (n > 0) return "text-rose-300";
  if (n < 0) return "text-emerald-300";
  return "text-white/60";
}

/** Colour a rule effect the intuitive way: plus is green, minus is red. */
function ruleClass(n: number): string {
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-rose-300";
  return "text-white/60";
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function triggerDownload(filename: string, text: string, type: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Board ─────────────────────────────────────────────────────────────────────

export function PubgolfBoard({ G, moves, playerID, matchID, matchData, isConnected }: Props) {
  const router = useRouter();
  const myID = playerID ?? "0";

  const [tab, setTab] = useState<Tab>("scores");
  const [avatars, setAvatars] = useState<Record<string, { styleKey: string; seed: string }>>({});

  // Avatars live in room metadata, not in matchData — fetch them like the other boards.
  useEffect(() => {
    let cancelled = false;
    getRoom(matchID)
      .then((room) => {
        if (cancelled) return;
        const map: Record<string, { styleKey: string; seed: string }> = {};
        for (const p of room.players) {
          if (p.data?.avatarStyle && p.data?.avatarSeed) {
            map[String(p.id)] = {
              styleKey: p.data.avatarStyle as string,
              seed: p.data.avatarSeed as string,
            };
          }
        }
        setAvatars(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchID, matchData]);

  // Only seated players (those with a name) take part.
  const roster = useMemo(
    () =>
      (matchData ?? [])
        .filter((p) => p.name)
        .map((p) => ({ id: String(p.id), name: p.name as string }))
        .sort((a, b) => Number(a.id) - Number(b.id)),
    [matchData]
  );

  const nameFor = (pid: string) =>
    matchData?.find((p) => String(p.id) === pid)?.name ?? `P${Number(pid) + 1}`;
  const avatarFor = (pid: string) => avatars[pid];

  const standings = useMemo(
    () => computeStandings(G, roster.map((r) => r.id)),
    [G, roster]
  );
  const payTotals = useMemo(() => paymentTotals(G), [G]);

  const bars = useMemo(() => G.stops.filter((s) => s.type === "bar"), [G.stops]);

  function leave() {
    clearIdentity(matchID);
    router.replace("/play");
  }

  // ── Header ───────────────────────────────────────────────────────────────────

  const currentStop = G.stops.find((s) => s.id === G.currentStopId) ?? null;

  const header = (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
      <button
        onClick={leave}
        aria-label="Leave"
        className="rounded-full px-1 text-2xl text-white/70 transition hover:text-white"
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">
          ⛳ Pubgolf{" "}
          <span className="font-mono tracking-widest text-amber-300">{matchID}</span>
        </p>
        <p className="truncate text-xs text-white/50">
          {currentStop ? `Now: ${currentStop.name}` : "On the crawl"}
        </p>
      </div>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${isConnected ? "bg-emerald-400" : "bg-rose-400"}`}
        title={isConnected ? "Connected" : "Reconnecting…"}
      />
    </header>
  );

  // ── Leaderboard ────────────────────────────────────────────────────────────────

  const leaderboard = (
    <Card>
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
        Leaderboard
      </p>
      {roster.length === 0 ? (
        <p className="text-sm text-white/50">Waiting for players…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {standings.map((s, i) => {
            const av = avatarFor(s.playerID);
            return (
              <li
                key={s.playerID}
                className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                  s.playerID === myID ? "bg-amber-400/10" : ""
                }`}
              >
                <span className="w-5 text-center text-sm font-bold tabular-nums text-white/50">
                  {s.disqualified ? "—" : i + 1}
                </span>
                {av ? (
                  <Avatar styleKey={av.styleKey} seed={av.seed} size={28} className="rounded-full" />
                ) : (
                  <span className="h-7 w-7 shrink-0 rounded-full bg-white/15" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {nameFor(s.playerID)}
                  {s.playerID === myID && <span className="text-white/40"> (you)</span>}
                </span>
                {s.disqualified ? (
                  <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-xs font-bold text-rose-200">
                    DISK
                  </span>
                ) : (
                  <span className={`text-lg font-bold tabular-nums ${deltaClass(s.total)}`}>
                    {fmt(s.total)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-center text-[11px] text-white/40">Lowest score wins 🏌️</p>
    </Card>
  );

  // ── Content per tab ──────────────────────────────────────────────────────────

  let content: React.ReactNode = null;
  if (tab === "course") {
    content = (
      <CourseTab
        G={G}
        moves={moves}
        stopMeta={STOP_META}
      />
    );
  } else if (tab === "scores") {
    content = (
      <>
        {leaderboard}
        <ScoresTab G={G} moves={moves} roster={roster} bars={bars} avatarFor={avatarFor} />
      </>
    );
  } else if (tab === "rules") {
    content = <RulesTab G={G} moves={moves} roster={roster} nameFor={nameFor} />;
  } else {
    content = (
      <PaymentsTab
        G={G}
        moves={moves}
        roster={roster}
        payTotals={payTotals}
        nameFor={nameFor}
        avatarFor={avatarFor}
      />
    );
  }

  return (
    <div className="felt flex min-h-screen flex-col text-white">
      {header}

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-4 pb-40">
        {content}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-black/70 backdrop-blur">
        {(
          [
            ["course", "Course", "📍"],
            ["scores", "Scores", "🏌️"],
            ["rules", "Rules", "📜"],
            ["payments", "Money", "💸"],
          ] as [Tab, string, string][]
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${
              tab === id ? "text-amber-300" : "text-white/50 hover:text-white/80"
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {G.phase === "finished" && (
        <ResultsOverlay
          G={G}
          moves={moves}
          standings={standings}
          payTotals={payTotals}
          nameFor={nameFor}
          onLeave={leave}
        />
      )}
    </div>
  );
}

// ─── Course tab ────────────────────────────────────────────────────────────────

type Moves = Props["moves"];

function CourseTab({
  G,
  moves,
  stopMeta,
}: {
  G: PubgolfState;
  moves: Moves;
  stopMeta: Record<StopType, { icon: string; label: string }>;
}) {
  const [type, setType] = useState<StopType>("bar");
  const [name, setName] = useState("");
  const [drink, setDrink] = useState("");
  const [par, setPar] = useState(0);
  const [challenge, setChallenge] = useState("");
  const [isPeeHole, setIsPeeHole] = useState(false);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    moves.addStop({
      type,
      name: trimmed,
      ...(type === "bar"
        ? {
            drink: drink.trim() || undefined,
            par: par > 0 ? par : undefined,
            challenge: challenge.trim() || undefined,
            isPeeHole: isPeeHole || undefined,
          }
        : {}),
    });
    setName("");
    setDrink("");
    setPar(0);
    setChallenge("");
    setIsPeeHole(false);
  }

  function move(id: string, dir: -1 | 1) {
    const ids = G.stops.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    moves.reorderStops(ids);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
          Add a stop
        </p>
        <div className="mb-3 flex gap-2">
          {STOP_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold transition ${
                type === t ? "bg-amber-400 text-black" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <span className="text-lg leading-none">{stopMeta[t].icon}</span>
              {stopMeta[t].label}
            </button>
          ))}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "bar" ? "Bar name" : "Place name"}
          maxLength={40}
          className="mb-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
        />
        {type === "bar" && (
          <div className="mb-3 flex flex-col gap-3">
            <input
              value={drink}
              onChange={(e) => setDrink(e.target.value)}
              placeholder="Drink (e.g. Øl, Shots, Drink)"
              maxLength={30}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30"
            />
            <label className="flex items-center justify-between text-sm text-white">
              <span>⛳ Par {par === 0 && <span className="text-white/40">(none)</span>}</span>
              <Stepper
                value={par}
                dim={par === 0}
                onDec={() => setPar((v) => Math.max(0, v - 1))}
                onInc={() => setPar((v) => v + 1)}
                label="Par"
              />
            </label>
            <input
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
              placeholder="Challenge (optional)"
              maxLength={120}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30"
            />
            <label className="flex items-center justify-between text-sm text-white">
              <span>🚻 Designated pee hole</span>
              <button
                type="button"
                role="switch"
                aria-checked={isPeeHole}
                onClick={() => setIsPeeHole((v) => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  isPeeHole ? "bg-amber-400" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isPeeHole ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="w-full rounded-xl bg-white/15 px-4 py-3 font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
        >
          Add {stopMeta[type].label.toLowerCase()}
        </button>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
          Course ({G.stops.length})
        </p>
        {G.stops.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/40">
            No stops yet — add your first bar above.
          </p>
        )}
        {G.stops.map((stop, i) => {
          const isCurrent = stop.id === G.currentStopId;
          return (
            <div
              key={stop.id}
              className={`rounded-2xl border bg-white/5 px-3 py-3 ${
                isCurrent ? "border-amber-400/60" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-center text-sm font-bold tabular-nums text-white/40">
                  {i + 1}
                </span>
                <span className="text-xl leading-none">{stopMeta[stop.type].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {stop.name}
                    {stop.drink && (
                      <span className="ml-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                        {stop.drink}
                      </span>
                    )}
                    {stop.isPeeHole && (
                      <span className="ml-1 rounded bg-sky-500/30 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
                        PEE
                      </span>
                    )}
                    {stop.type === "bar" && typeof stop.par === "number" && (
                      <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
                        PAR {stop.par}
                      </span>
                    )}
                  </p>
                  {stop.type === "bar" && stop.challenge && (
                    <p className="truncate text-xs text-white/50">{stop.challenge}</p>
                  )}
                  {stop.note && <p className="truncate text-xs text-white/40">{stop.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(stop.id, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(stop.id, 1)}
                    disabled={i === G.stops.length - 1}
                    aria-label="Move down"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => moves.removeStop(stop.id)}
                    aria-label="Remove"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-200 transition hover:bg-rose-500/30"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {stop.type === "bar" && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
                  <span className="text-xs font-semibold text-white/50">
                    ⛳ Par {typeof stop.par !== "number" && <span className="text-white/30">(none)</span>}
                  </span>
                  <Stepper
                    value={stop.par ?? 0}
                    dim={typeof stop.par !== "number"}
                    onDec={() =>
                      moves.updateStop(stop.id, { par: Math.max(0, (stop.par ?? 0) - 1) })
                    }
                    onInc={() => moves.updateStop(stop.id, { par: (stop.par ?? 0) + 1 })}
                    label="Par"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => moves.setCurrentStop(isCurrent ? null : stop.id)}
                className={`mt-2 w-full rounded-lg py-1.5 text-xs font-semibold transition ${
                  isCurrent
                    ? "bg-amber-400/20 text-amber-200"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {isCurrent ? "✓ We're here" : "Set as current stop"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scores tab ────────────────────────────────────────────────────────────────

function ScoresTab({
  G,
  moves,
  roster,
  bars,
  avatarFor,
}: {
  G: PubgolfState;
  moves: Moves;
  roster: { id: string; name: string }[];
  bars: PubgolfState["stops"];
  avatarFor: (pid: string) => { styleKey: string; seed: string } | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    G.currentStopId ?? bars[0]?.id ?? null
  );
  const selected =
    bars.find((b) => b.id === selectedId) ?? bars.find((b) => b.id === G.currentStopId) ?? bars[0] ?? null;

  const currentIndex = Math.max(
    0,
    bars.findIndex((b) => b.id === selected?.id)
  );

  function goTo(idx: number) {
    const clamped = Math.max(0, Math.min(bars.length - 1, idx));
    if (bars[clamped]) setSelectedId(bars[clamped].id);
  }

  if (bars.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-white/50">Add a bar on the Course tab to score.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          aria-label="Previous pub"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          ‹
        </button>
        <p className="min-w-0 flex-1 truncate text-center">
          <span className="block truncate text-base font-bold text-white">
            {selected?.name}
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Hole {currentIndex + 1} / {bars.length}
          </span>
        </p>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === bars.length - 1}
          aria-label="Next pub"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="flex justify-center gap-1.5">
        {bars.map((b, i) => (
          <span
            key={b.id}
            aria-hidden="true"
            className={`h-1.5 rounded-full transition-all ${
              i === currentIndex ? "w-5 bg-amber-400" : "w-1.5 bg-white/25"
            }`}
          />
        ))}
      </div>

      {selected && (
        <Card>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-lg font-bold text-white">
              {selected.name}
              {selected.drink && (
                <span className="ml-2 rounded bg-amber-400/20 px-2 py-0.5 align-middle text-xs font-bold text-amber-200">
                  {selected.drink}
                </span>
              )}
              {selected.isPeeHole && (
                <span className="ml-1 rounded bg-sky-500/30 px-1.5 py-0.5 align-middle text-[10px] font-bold text-sky-200">
                  PEE
                </span>
              )}
              {typeof selected.par === "number" && (
                <span className="ml-1 rounded bg-emerald-500/20 px-1.5 py-0.5 align-middle text-[10px] font-bold text-emerald-200">
                  PAR {selected.par}
                </span>
              )}
            </span>
          </div>
          {selected.challenge && (
            <p className="mb-3 text-sm text-white/60">🎯 {selected.challenge}</p>
          )}

          <ul className="flex flex-col divide-y divide-white/10">
            {roster.map((p) => {
              const cell = G.scores[selected.id]?.[p.id] ?? {};
              const hasSips = typeof cell.sips === "number";
              const sips = hasSips ? (cell.sips as number) : 0;
              const chal = cell.challengeDelta ?? 0;
              const holePts = (hasSips ? sips - (selected.par ?? 0) : 0) + chal;
              const hasScore = hasSips || chal !== 0;
              const av = avatarFor(p.id);
              return (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center gap-2">
                    {av ? (
                      <Avatar
                        styleKey={av.styleKey}
                        seed={av.seed}
                        size={26}
                        className="rounded-full"
                      />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-white/15" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {p.name}
                    </span>
                    {hasScore ? (
                      <span className={`text-sm font-bold tabular-nums ${deltaClass(holePts)}`}>
                        {holePts} {Math.abs(holePts) === 1 ? "pt" : "pts"}
                      </span>
                    ) : (
                      <span className="text-xs text-white/30">not played</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pl-8">
                    <span className="text-xs text-white/50">Sips</span>
                    <Stepper
                      value={sips}
                      dim={!hasSips}
                      onDec={() => moves.setSips(selected.id, p.id, Math.max(0, sips - 1))}
                      onInc={() => moves.setSips(selected.id, p.id, sips + 1)}
                      label="Sips"
                    />
                  </div>
                  <div className="flex items-center justify-between pl-8">
                    <span className="text-xs text-white/50">Challenge ±</span>
                    <Stepper
                      value={fmt(chal)}
                      onDec={() =>
                        moves.setChallengeDelta(
                          selected.id,
                          p.id,
                          chal - 1 === 0 ? null : chal - 1
                        )
                      }
                      onInc={() =>
                        moves.setChallengeDelta(
                          selected.id,
                          p.id,
                          chal + 1 === 0 ? null : chal + 1
                        )
                      }
                      label="Challenge"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <button
        type="button"
        onClick={() => moves.finishNight()}
        className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-center font-bold text-white transition hover:bg-white/10"
      >
        Finish the night 🏁
      </button>
    </div>
  );
}

// ─── Rules tab ─────────────────────────────────────────────────────────────────

function RulesTab({
  G,
  moves,
  roster,
  nameFor,
}: {
  G: PubgolfState;
  moves: Moves;
  roster: { id: string; name: string }[];
  nameFor: (pid: string) => string;
}) {
  const [applying, setApplying] = useState<string | null>(null); // ruleId being applied
  const [showAdd, setShowAdd] = useState(false);
  const [text, setText] = useState("");
  const [delta, setDelta] = useState(1);
  const [disq, setDisq] = useState(false);

  function apply(ruleId: string, playerID: string) {
    moves.applyPenalty({ playerID, ruleId });
    setApplying(null);
  }

  function addRule() {
    const t = text.trim();
    if (!t) return;
    moves.addRule({ text: t, delta: disq ? 0 : delta, disqualifies: disq || undefined });
    setText("");
    setDelta(1);
    setDisq(false);
    setShowAdd(false);
  }

  const recent = G.penalties.slice(-8).reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">Rules</p>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
          >
            {showAdd ? "Cancel" : "+ Add rule"}
          </button>
        </div>

        {showAdd && (
          <Card>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Rule text"
              maxLength={120}
              className="mb-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30"
            />
            <label className="mb-3 flex items-center justify-between text-sm text-white">
              <span>Disqualifies (DISK)</span>
              <button
                type="button"
                role="switch"
                aria-checked={disq}
                onClick={() => setDisq((v) => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  disq ? "bg-rose-400" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    disq ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            {!disq && (
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-white">Points</span>
                <Stepper
                  value={fmt(delta)}
                  onDec={() => setDelta((d) => d - 1)}
                  onInc={() => setDelta((d) => d + 1)}
                  label="Points"
                />
              </div>
            )}
            <button
              type="button"
              onClick={addRule}
              disabled={!text.trim()}
              className="w-full rounded-xl bg-white/15 px-4 py-2.5 font-semibold text-white hover:bg-white/25 disabled:opacity-40"
            >
              Add rule
            </button>
          </Card>
        )}

        {G.rules.map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-sm text-white">{rule.text}</p>
              {rule.disqualifies ? (
                <span className="shrink-0 rounded-full bg-rose-500/30 px-2 py-0.5 text-xs font-bold text-rose-200">
                  DISK
                </span>
              ) : (
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${ruleClass(rule.delta)}`}
                >
                  {fmt(rule.delta)}
                </span>
              )}
            </div>
            {applying === rule.id ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-white/50">Apply to…</p>
                <div className="flex flex-wrap gap-2">
                  {roster.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => apply(rule.id, p.id)}
                      className="rounded-full bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black hover:bg-amber-300"
                    >
                      {p.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setApplying(null)}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setApplying(rule.id)}
                  disabled={roster.length === 0}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  Apply to player
                </button>
                <button
                  type="button"
                  onClick={() => moves.removeRule(rule.id)}
                  className="rounded-lg px-2 py-1.5 text-xs text-white/40 hover:text-rose-300"
                >
                  remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
            Recent penalties
          </p>
          {recent.map((pen) => (
            <div
              key={pen.id}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-white">{nameFor(pen.playerID)}</span>
              <span className="min-w-0 flex-1 truncate text-white/50">{pen.text}</span>
              {pen.disqualifies ? (
                <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-xs font-bold text-rose-200">
                  DISK
                </span>
              ) : (
                <span className={`font-bold tabular-nums ${ruleClass(pen.delta)}`}>
                  {fmt(pen.delta)}
                </span>
              )}
              <button
                type="button"
                onClick={() => moves.removePenalty(pen.id)}
                aria-label="Undo"
                className="text-white/40 hover:text-rose-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payments tab ──────────────────────────────────────────────────────────────

function PaymentsTab({
  G,
  moves,
  roster,
  payTotals,
  nameFor,
  avatarFor,
}: {
  G: PubgolfState;
  moves: Moves;
  roster: { id: string; name: string }[];
  payTotals: Record<string, number>;
  nameFor: (pid: string) => string;
  avatarFor: (pid: string) => { styleKey: string; seed: string } | undefined;
}) {
  const [payer, setPayer] = useState<string>(roster[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!payer && roster[0]) setPayer(roster[0].id);
  }, [roster, payer]);

  // Accept both "12.50" and Danish "12,50".
  const parsedAmount = Number(amount.replace(",", "."));

  function add() {
    if (!payer || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    moves.addPayment({ payerId: payer, amount: parsedAmount, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  }

  const grandTotal = G.payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
          Add a payment
        </p>
        {roster.length === 0 ? (
          <p className="text-sm text-white/50">Waiting for players…</p>
        ) : (
          <>
            <p className="mb-1.5 text-xs text-white/50">Who paid?</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {roster.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayer(p.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    payer === p.id
                      ? "bg-amber-400 text-black"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="mb-3 flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Amount"
                className="w-28 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/30"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What for? (optional)"
                maxLength={60}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30"
              />
            </div>
            <button
              type="button"
              onClick={add}
              disabled={!payer || !(parsedAmount > 0)}
              className="w-full rounded-xl bg-white/15 px-4 py-3 font-semibold text-white hover:bg-white/25 disabled:opacity-40"
            >
              Add payment
            </button>
          </>
        )}
      </Card>

      {roster.length > 0 && (
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
              Per person
            </p>
            <p className="text-sm text-white/60">
              Total <span className="font-bold text-amber-300">{grandTotal}</span>
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {roster.map((p) => {
              const av = avatarFor(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2">
                  {av ? (
                    <Avatar
                      styleKey={av.styleKey}
                      seed={av.seed}
                      size={24}
                      className="rounded-full"
                    />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-white/15" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{p.name}</span>
                  <span className="text-sm font-bold tabular-nums text-white">
                    {payTotals[p.id] ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {G.payments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">Ledger</p>
          {[...G.payments].reverse().map((pay) => (
            <div
              key={pay.id}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-white">{nameFor(pay.payerId)}</span>
              <span className="min-w-0 flex-1 truncate text-white/50">{pay.note ?? "—"}</span>
              <span className="font-bold tabular-nums text-white">{pay.amount}</span>
              <button
                type="button"
                onClick={() => moves.removePayment(pay.id)}
                aria-label="Delete"
                className="text-white/40 hover:text-rose-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Results overlay ───────────────────────────────────────────────────────────

function ResultsOverlay({
  G,
  moves,
  standings,
  payTotals,
  nameFor,
  onLeave,
}: {
  G: PubgolfState;
  moves: Moves;
  standings: ReturnType<typeof computeStandings>;
  payTotals: Record<string, number>;
  nameFor: (pid: string) => string;
  onLeave: () => void;
}) {
  function download() {
    const lines: string[] = [];
    lines.push("PUBGOLF — the night");
    lines.push(new Date().toLocaleString());
    lines.push("");
    lines.push("FINAL STANDINGS (lowest wins)");
    standings.forEach((s, i) => {
      lines.push(
        `${s.disqualified ? "DISK" : `#${i + 1}`}  ${nameFor(s.playerID)}  ${
          s.disqualified ? "" : fmt(s.total)
        }`.trimEnd()
      );
    });
    lines.push("");
    lines.push("COURSE & SCORES");
    G.stops.forEach((stop, i) => {
      const meta = STOP_META[stop.type];
      const extras = [stop.drink, typeof stop.par === "number" ? `par ${stop.par}` : undefined, stop.challenge, stop.note]
        .filter(Boolean)
        .join(", ");
      lines.push(`${i + 1}. ${meta.icon} ${stop.name}${extras ? ` (${extras})` : ""}`);
      if (stop.type === "bar") {
        standings.forEach((s) => {
          const cell = G.scores[stop.id]?.[s.playerID];
          if (!cell) return;
          const parts: string[] = [];
          if (typeof cell.sips === "number") {
            parts.push(`${cell.sips} sips`);
            if (typeof stop.par === "number") parts.push(`par ${stop.par}`);
          }
          if (typeof cell.challengeDelta === "number")
            parts.push(`challenge ${fmt(cell.challengeDelta)}`);
          if (parts.length === 0) return;
          const total =
            (typeof cell.sips === "number" ? cell.sips - (stop.par ?? 0) : 0) +
            (cell.challengeDelta ?? 0);
          lines.push(`     ${nameFor(s.playerID)}: ${parts.join(", ")} = ${total} pts`);
        });
      }
    });
    lines.push("");
    lines.push("PAYMENTS");
    lines.push(`Total: ${G.payments.reduce((sum, p) => sum + p.amount, 0)}`);
    Object.entries(payTotals).forEach(([pid, total]) => {
      lines.push(`  ${nameFor(pid)}: ${total}`);
    });
    if (G.payments.length > 0) {
      lines.push("");
      lines.push("  Ledger:");
      G.payments.forEach((pay) => {
        lines.push(`   - ${nameFor(pay.payerId)}: ${pay.amount}${pay.note ? ` — ${pay.note}` : ""}`);
      });
    }
    lines.push("");
    lines.push("PENALTIES");
    G.penalties.forEach((pen) => {
      lines.push(
        `  ${nameFor(pen.playerID)} — ${pen.text} (${pen.disqualifies ? "DISK" : fmt(pen.delta)})`
      );
    });

    triggerDownload("pubgolf-night.txt", lines.join("\n"), "text/plain");
  }

  function downloadJson() {
    const data = {
      exportedAt: new Date().toISOString(),
      standings: standings.map((s) => ({ ...s, name: nameFor(s.playerID) })),
      stops: G.stops,
      scores: G.scores,
      rules: G.rules,
      penalties: G.penalties.map((p) => ({ ...p, name: nameFor(p.playerID) })),
      payments: G.payments.map((p) => ({ ...p, name: nameFor(p.payerId) })),
      paymentTotals: payTotals,
    };
    triggerDownload("pubgolf-night.json", JSON.stringify(data, null, 2), "application/json");
  }

  const winner = standings.find((s) => !s.disqualified);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-5">
        <p className="text-center text-2xl font-bold text-white">🏁 The night is over</p>
        {winner && (
          <p className="mt-1 text-center text-sm text-white/60">
            Winner: <span className="font-bold text-amber-300">{nameFor(winner.playerID)}</span> with{" "}
            {fmt(winner.total)}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-1.5">
          {standings.map((s, i) => (
            <li
              key={s.playerID}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
            >
              <span className="w-5 text-center text-sm font-bold text-white/50">
                {s.disqualified ? "—" : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {nameFor(s.playerID)}
              </span>
              {s.disqualified ? (
                <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-xs font-bold text-rose-200">
                  DISK
                </span>
              ) : (
                <span className={`text-lg font-bold tabular-nums ${deltaClass(s.total)}`}>
                  {fmt(s.total)}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={download}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-black hover:bg-amber-300"
          >
            ⬇ Download the night (.txt)
          </button>
          <button
            type="button"
            onClick={downloadJson}
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            Download data (.json)
          </button>
          <button
            type="button"
            onClick={() => moves.reopenNight()}
            className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Reopen — keep going
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="w-full rounded-xl px-4 py-2.5 text-sm text-white/50 hover:text-white"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
