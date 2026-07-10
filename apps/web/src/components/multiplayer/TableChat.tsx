"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "boardgame.io";
import { Avatar } from "@/components/Avatar";
import { playChat } from "@/lib/multiplayer/sound";

type AvatarInfo = { styleKey: string; seed: string };

/** Payload shape we send/receive over boardgame.io's chat channel. */
type ChatPayload = { text: string };

const MAX_LEN = 300;

function textOf(msg: ChatMessage): string {
  const payload = msg.payload as Partial<ChatPayload> | string | undefined;
  if (typeof payload === "string") return payload;
  return typeof payload?.text === "string" ? payload.text : "";
}

/**
 * Floating in-table chat for online matches. boardgame.io relays messages over
 * its SocketIO transport, so this is purely presentational: it renders the
 * `chatMessages` it's given and calls `onSend` to broadcast new ones.
 *
 * Messages are ephemeral — boardgame.io does not persist them, so they reset on
 * reload and aren't shown to players who join later.
 */
export function TableChat({
  messages,
  onSend,
  me,
  nameFor,
  avatars,
  soundOn,
}: {
  messages: ChatMessage[];
  onSend: (payload: ChatPayload) => void;
  me: string;
  nameFor: (pid: string) => string;
  avatars: Record<string, AvatarInfo>;
  soundOn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // How many messages the player has already seen (drives the unread badge).
  const [seen, setSeen] = useState(messages.length);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(messages.length);

  const unread = open ? 0 : Math.max(0, messages.length - seen);

  // Chime on an incoming message from someone else (respecting the sound pref).
  useEffect(() => {
    if (messages.length > prevCount.current) {
      const arrived = messages.slice(prevCount.current);
      if (soundOn && arrived.some((m) => String(m.sender) !== me)) playChat();
    }
    prevCount.current = messages.length;
  }, [messages, soundOn, me]);

  // While open, keep "seen" caught up and stick to the bottom of the list.
  useEffect(() => {
    if (open) {
      setSeen(messages.length);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages.length]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function send() {
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text) return;
    onSend({ text });
    setDraft("");
  }

  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        const sender = String(m.sender);
        const mine = sender === me;
        return (
          <li
            key={m.id ?? i}
            className={`flex gap-2 ${mine ? "flex-row-reverse text-right" : ""}`}
          >
            <AvatarBubble a={avatars[sender]} />
            <div className={`min-w-0 ${mine ? "items-end" : ""}`}>
              <div className="text-[11px] font-semibold text-white/60">
                {mine ? "You" : nameFor(sender)}
              </div>
              <div
                className={`inline-block max-w-[14rem] break-words rounded-2xl px-3 py-1.5 text-sm ${
                  mine ? "bg-emerald-500/80 text-black" : "bg-white/15 text-white"
                }`}
              >
                {textOf(m)}
              </div>
            </div>
          </li>
        );
      }),
    [messages, me, avatars, nameFor]
  );

  return (
    <>
      {/* Floating toggle button + unread badge. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl shadow-lg ring-2 ring-emerald-300/50 hover:bg-emerald-400"
      >
        💬
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel. */}
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex max-h-[60vh] w-[min(90vw,20rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/95 text-white shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-sm font-semibold">Table chat</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-full px-2 text-lg leading-none text-white/70 hover:text-white"
            >
              ×
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="mt-4 text-center text-xs text-white/40">
                No messages yet. Say hello! 👋
              </p>
            ) : (
              <ul className="flex flex-col gap-3">{rows}</ul>
            )}
          </div>

          <div className="border-t border-white/10 px-2 py-2">
            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={MAX_LEN}
                placeholder="Message…"
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="rounded-full bg-emerald-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40 hover:bg-emerald-400"
              >
                Send
              </button>
            </div>
            <p className="mt-1 px-1 text-[10px] text-white/30">
              Messages aren&apos;t saved — they clear when you leave.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function AvatarBubble({ a }: { a?: AvatarInfo }) {
  if (!a) {
    return <div className="h-7 w-7 shrink-0 rounded-full bg-white/15" aria-hidden />;
  }
  return (
    <Avatar styleKey={a.styleKey} seed={a.seed} size={28} className="shrink-0 rounded-full" />
  );
}
