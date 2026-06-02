import Link from "next/link";
import { JoinForm } from "@/components/multiplayer/JoinForm";

export const metadata = {
  title: "Play online · Games Counter",
};

export default function PlayHome() {
  return (
    <main className="felt flex flex-1 flex-col items-center px-5 py-12">
      <header className="mb-10 flex w-full max-w-md items-center gap-3">
        <Link
          href="/"
          className="rounded-full px-2 py-1 text-2xl text-white/70 transition hover:text-white"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          Play online
        </h1>
      </header>

      <section className="flex w-full max-w-md flex-col gap-8">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
            Host a game
          </h2>
          <Link
            href="/play/new"
            className="game-card flex items-center justify-between rounded-2xl px-6 py-5 text-white"
          >
            <span className="flex flex-col">
              <span className="text-xl font-bold">Create a room</span>
              <span className="text-sm text-white/75">
                Pick players, share the code
              </span>
            </span>
            <span className="text-3xl" aria-hidden>
              ＋
            </span>
          </Link>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
            Join with a code
          </h2>
          <JoinForm />
        </div>
      </section>
    </main>
  );
}
