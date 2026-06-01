"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUIT_SYMBOL, type Suit } from "@/lib/games";
import {
  computeStandings,
  gabongHundredHits,
  makeRound,
  pirateRoundInfo,
  pirateStartCards,
  type HundredHit,
  type Round,
} from "@/lib/scoring";
import {
  deleteSession,
  getSession,
  upsertSession,
  type GameSession,
  type GameStatus,
} from "@/lib/sessions";
import { Avatar } from "./Avatar";
import { HundredPopup } from "./HundredPopup";
import { ResultPopup } from "./ResultPopup";
import { RoundSheet } from "./RoundSheet";

interface ResultInfo {
  emoji: string;
  title: string;
  caption: string;
  highlightIds: string[];
}

type Editing = { index: number } | "new" | null;

export function GameScreen({
  slug,
  gameName,
  suit,
  sessionId,
}: {
  slug: string;
  gameName: string;
  suit: Suit;
  sessionId: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null | undefined>(
    undefined
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [popupHits, setPopupHits] = useState<HundredHit[] | null>(null);
  const [resultPopup, setResultPopup] = useState<ResultInfo | null>(null);

  useEffect(() => {
    setSession(getSession(sessionId) ?? null);
  }, [sessionId]);

  if (session === undefined) {
    return <main className="felt flex-1" />;
  }

  if (session === null) {
    return (
      <main className="felt flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-white/80">This game could not be found.</p>
        <Link
          href={`/games/${slug}`}
          className="game-card rounded-xl px-5 py-3 font-semibold text-white"
        >
          ← Back to {gameName}
        </Link>
      </main>
    );
  }

  const { players, rounds } = session;
  const isPirate = slug === "piratbridge";
  const lowerIsBetter = slug === "gabong";
  const standings = computeStandings(slug, players, rounds);
  const finished = session.status === "finished";

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  const roundComplete = (round: Round) =>
    players.every((p) => p.id in round.scores);

  const recomputeStatus = (rs: Round[]): GameStatus => {
    if (slug === "500" || slug === "gabong") {
      return computeStandings(slug, players, rs).finished ? "finished" : "active";
    }
    return rs.length > 0 && rs.every(roundComplete) ? "finished" : "active";
  };

  const buildResult = (rs: Round[]): ResultInfo | null => {
    const s = computeStandings(slug, players, rs);
    if (slug === "gabong") {
      if (!s.loserIds.length) return null;
      return {
        emoji: "💥",
        title: "Game over",
        caption: `${s.loserIds.map(nameOf).join(", ")} busted past 500 and loses`,
        highlightIds: s.loserIds,
      };
    }
    if (!s.winnerIds.length) return null;
    return {
      emoji: "🏆",
      title: s.winnerIds.length > 1 ? "Winners!" : "Winner!",
      caption: slug === "500" ? "First to 500 points!" : "Highest score wins",
      highlightIds: s.winnerIds,
    };
  };

  const commitRounds = (rs: Round[]) => {
    const newStatus = recomputeStatus(rs);
    // Celebrate the moment the game transitions to finished.
    if (session.status !== "finished" && newStatus === "finished") {
      const result = buildResult(rs);
      if (result) {
        setPopupHits(null);
        setResultPopup(result);
      }
    }
    setSession(upsertSession({ ...session, rounds: rs, status: newStatus }));
  };

  const checkHundred = (priorRounds: Round[], scores: Record<string, number>) => {
    if (slug !== "gabong") return;
    const hits = gabongHundredHits(players, priorRounds, scores);
    if (hits.length) setPopupHits(hits);
  };

  const saveRound = (index: number, scores: Record<string, number>) => {
    checkHundred(rounds.slice(0, index), scores);
    commitRounds(rounds.map((r, i) => (i === index ? { ...r, scores } : r)));
    setEditing(null);
  };
  const addRound = (scores: Record<string, number>) => {
    checkHundred(rounds, scores);
    commitRounds([...rounds, makeRound(scores)]);
    setEditing(null);
  };
  const deleteRound = (index: number) => {
    commitRounds(rounds.filter((_, i) => i !== index));
    setEditing(null);
  };
  const rename = (name: string) =>
    setSession(upsertSession({ ...session, name }));
  const removeGame = () => {
    if (!window.confirm("Delete this game?")) return;
    deleteSession(session.id);
    router.replace(`/games/${slug}`);
  };

  // Ordered leaderboard
  const ordered = [...players].sort((a, b) =>
    lowerIsBetter
      ? standings.totals[a.id] - standings.totals[b.id]
      : standings.totals[b.id] - standings.totals[a.id]
  );
  const winners = new Set(standings.winnerIds);
  const losers = new Set(standings.loserIds);

  // Status banner
  let banner = "";
  if (finished) {
    if (slug === "gabong") {
      banner = `💥 ${[...losers].map(nameOf).join(", ")} busted — game over`;
    } else {
      banner = `👑 ${standings.winnerIds.map(nameOf).join(", ")} ${
        slug === "500" ? "reached 500!" : "wins!"
      }`;
    }
  } else if (slug === "500") {
    banner = "First to 500 wins";
  } else if (slug === "gabong") {
    banner = "Avoid hitting 500 — that player loses";
  } else {
    const total = pirateStartCards(players.length);
    const done = rounds.filter(roundComplete).length;
    banner = `Round ${Math.min(done + 1, total)} of ${total}`;
  }

  const roundLabel = (i: number) => {
    if (!isPirate) return `Round ${i + 1}`;
    const { cards } = pirateRoundInfo(players, i);
    return `${cards} ${cards === 1 ? "card" : "cards"}`;
  };
  const roundSubtitle = (i: number) =>
    isPirate ? `Deal: ${pirateRoundInfo(players, i).dealer?.name ?? "?"}` : undefined;

  const editingScores =
    editing && editing !== "new" ? rounds[editing.index].scores : {};

  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-8">
      <header className="mb-4 flex w-full max-w-md items-center gap-3">
        <Link
          href={`/games/${slug}`}
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back"
        >
          ←
        </Link>
        <span className="text-2xl" aria-hidden>
          {SUIT_SYMBOL[suit]}
        </span>
        <input
          value={session.name}
          onChange={(e) => rename(e.target.value)}
          aria-label="Game name"
          className="min-w-0 flex-1 bg-transparent text-lg font-bold text-white focus:outline-none"
        />
      </header>

      <div className="w-full max-w-md">
        {/* Status banner */}
        <div
          className={`mb-4 rounded-2xl px-4 py-3 text-center text-sm font-semibold ${
            finished
              ? "bg-card-red/30 text-white"
              : "bg-white/5 text-white/70"
          }`}
        >
          {banner}
        </div>

        {/* Leaderboard */}
        <ul className="mb-6 flex flex-col gap-2">
          {ordered.map((p, rank) => {
            const isWinner = finished && winners.has(p.id);
            const isLoser = finished && losers.has(p.id);
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl border p-2 pr-4 ${
                  isWinner
                    ? "border-card-red-light bg-card-red/20"
                    : isLoser
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/5"
                }`}
              >
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-white/40">
                  {rank + 1}
                </span>
                <Avatar
                  styleKey={p.avatarStyle}
                  seed={p.avatarSeed}
                  size={40}
                  className="rounded-full"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-white">
                  {p.name}
                  {isWinner && " 👑"}
                  {isLoser && " 💥"}
                </span>
                <span className="shrink-0 text-2xl font-bold tabular-nums text-white">
                  {standings.totals[p.id]}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Rounds */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
          Rounds
        </h2>
        <ul className="flex flex-col gap-2">
          {rounds.map((round, i) => (
            <li key={round.id}>
              <button
                type="button"
                onClick={() => setEditing({ index: i })}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
              >
                <div className="w-24 shrink-0">
                  <p className="font-semibold text-white">{roundLabel(i)}</p>
                  {roundSubtitle(i) && (
                    <p className="truncate text-xs text-white/50">
                      {roundSubtitle(i)}
                    </p>
                  )}
                </div>
                <div className="flex flex-1 flex-wrap justify-end gap-x-3 gap-y-1">
                  {players.map((p) => (
                    <span
                      key={p.id}
                      className="text-sm tabular-nums text-white/70"
                    >
                      <span className="text-white/40">
                        {p.name.slice(0, 1)}
                      </span>{" "}
                      {p.id in round.scores ? round.scores[p.id] : "–"}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {!isPirate && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="game-card mt-3 w-full rounded-2xl py-3.5 font-bold text-white"
          >
            + Add round
          </button>
        )}

        <button
          type="button"
          onClick={removeGame}
          className="mx-auto mt-8 block text-xs text-white/40 transition hover:text-white/70"
        >
          Delete game
        </button>
      </div>

      {editing && (
        <RoundSheet
          players={players}
          title={editing === "new" ? `Round ${rounds.length + 1}` : roundLabel(editing.index)}
          subtitle={editing === "new" ? undefined : roundSubtitle(editing.index)}
          hint={
            slug === "500"
              ? "Points are multiples of 5 (negatives allowed)."
              : undefined
          }
          initial={editingScores}
          onSave={(scores) =>
            editing === "new" ? addRound(scores) : saveRound(editing.index, scores)
          }
          onClose={() => setEditing(null)}
          onDelete={
            editing !== "new" && !isPirate
              ? () => deleteRound(editing.index)
              : undefined
          }
        />
      )}

      {popupHits && !resultPopup && (
        <HundredPopup
          hits={popupHits}
          players={players}
          onClose={() => setPopupHits(null)}
        />
      )}

      {resultPopup && (
        <ResultPopup
          emoji={resultPopup.emoji}
          title={resultPopup.title}
          caption={resultPopup.caption}
          players={players}
          highlightIds={resultPopup.highlightIds}
          onClose={() => setResultPopup(null)}
        />
      )}
    </main>
  );
}
