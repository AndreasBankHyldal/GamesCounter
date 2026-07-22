"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "boardgame.io";
import { Avatar } from "@/components/Avatar";
import { playChat } from "@/lib/multiplayer/sound";

type AvatarInfo = { styleKey: string; seed: string };

/** A GIF chosen from the picker (normalized by /api/gifs). */
interface GifResult {
  id: string;
  url: string;
  preview: string;
  width?: number;
  height?: number;
  alt: string;
}

/** Payload shapes we send/receive over boardgame.io's chat channel. */
type GifPayload = {
  type: "gif";
  url: string;
  preview?: string;
  width?: number;
  height?: number;
  alt?: string;
};
type ChatPayload = { text: string } | GifPayload;

const MAX_LEN = 300;

// A compact set of common reactions for the quick emoji picker.
const EMOJIS = [
  "😀", "😂", "😍", "😎", "🤔", "😅", "😭", "😡",
  "👍", "👎", "👏", "🙏", "🔥", "🎉", "❤️", "💔",
  "🃏", "♠️", "♥️", "♦️", "♣️", "🏆", "😴", "🤝",
];

function textOf(msg: ChatMessage): string {
  const payload = msg.payload as Partial<{ text: string }> | string | undefined;
  if (typeof payload === "string") return payload;
  return typeof payload?.text === "string" ? payload.text : "";
}

/** Returns the GIF payload if this message is a GIF, else null. */
function gifOf(msg: ChatMessage): GifPayload | null {
  const p = msg.payload;
  if (p && typeof p === "object" && (p as { type?: unknown }).type === "gif") {
    const g = p as GifPayload;
    if (typeof g.url === "string" && g.url) return g;
  }
  return null;
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  // null = not yet checked; false = no KLIPY_API_KEY (hide the GIF button).
  const [gifConfigured, setGifConfigured] = useState<boolean | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
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

  // Focus the input when the panel opens; close the pickers when it closes.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setEmojiOpen(false);
      setGifOpen(false);
    }
  }, [open]);

  // Feature-detect the GIF provider (and prime trending) the first time the
  // chat opens. If /api/gifs reports it's not configured, the button stays hidden.
  useEffect(() => {
    if (!open || gifConfigured !== null) return;
    let cancelled = false;
    fetch("/api/gifs")
      .then((r) => r.json())
      .then((d: { configured?: boolean; results?: GifResult[] }) => {
        if (cancelled) return;
        setGifConfigured(Boolean(d.configured));
        if (d.configured && Array.isArray(d.results)) setGifResults(d.results);
      })
      .catch(() => {
        if (!cancelled) setGifConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gifConfigured]);

  // Debounced GIF search (empty query -> trending), while the GIF panel is open.
  useEffect(() => {
    if (!gifOpen || gifConfigured === false) return;
    const q = gifQuery.trim();
    const ctrl = new AbortController();
    setGifLoading(true);
    const t = setTimeout(
      () => {
        fetch(`/api/gifs?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
          .then((r) => r.json())
          .then((d: { results?: GifResult[] }) => {
            setGifResults(Array.isArray(d.results) ? d.results : []);
          })
          .catch(() => {})
          .finally(() => setGifLoading(false));
      },
      q ? 350 : 0
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [gifQuery, gifOpen, gifConfigured]);

  function send() {
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text) return;
    onSend({ text });
    setDraft("");
    setEmojiOpen(false);
  }

  function sendGif(g: GifResult) {
    onSend({
      type: "gif",
      url: g.url,
      preview: g.preview,
      width: g.width,
      height: g.height,
      alt: g.alt,
    });
    setGifOpen(false);
  }

  // Insert an emoji at the caret (or append), keeping within the length cap and
  // returning focus to the input so the player can keep typing.
  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MAX_LEN);
    setDraft(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const caret = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(caret, caret);
    });
  }

  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        const sender = String(m.sender);
        const mine = sender === me;
        const gif = gifOf(m);
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
              {gif ? (
                <a
                  href={gif.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block overflow-hidden rounded-2xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote GIF from provider; next/image would need domain config */}
                  <img
                    src={gif.preview || gif.url}
                    alt={gif.alt || "GIF"}
                    loading="lazy"
                    className="max-h-48 max-w-[12rem] rounded-2xl"
                  />
                </a>
              ) : (
                <div
                  className={`inline-block max-w-[14rem] break-words rounded-2xl px-3 py-1.5 text-sm ${
                    mine ? "bg-emerald-500/80 text-black" : "bg-white/15 text-white"
                  }`}
                >
                  {textOf(m)}
                </div>
              )}
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

      {/* Backdrop: catches touches so the board behind can't be scrolled/tapped
          while the chat is open, and closes the panel when tapped. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-0"
        />
      )}

      {/* Chat panel. */}
      {open && (
        <div className="fixed inset-x-2 bottom-20 z-40 mx-auto flex h-[70vh] max-h-[calc(100dvh-6rem)] w-auto max-w-[28rem] flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/95 text-white shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4">
          {gifOpen && gifConfigured && (
            <div className="absolute inset-0 z-30 flex flex-col bg-neutral-900">
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <input
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                  placeholder="Search GIFs…"
                  aria-label="Search GIFs"
                  autoFocus
                  name="gif-search"
                  autoComplete="off"
                  autoCorrect="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-1.5 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
                />
                <button
                  type="button"
                  onClick={() => setGifOpen(false)}
                  aria-label="Close GIF picker"
                  className="shrink-0 rounded-full px-2 text-lg leading-none text-white/70 hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2">
                <div className="grid grid-cols-2 gap-2">
                  {gifResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => sendGif(g)}
                      aria-label={`Send ${g.alt}`}
                      className="overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10 transition hover:ring-2 hover:ring-emerald-400/70"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote GIF thumbnail from provider */}
                      <img
                        src={g.preview || g.url}
                        alt={g.alt}
                        loading="lazy"
                        className="h-36 w-full object-contain"
                      />
                    </button>
                  ))}
                </div>
                {!gifLoading && gifResults.length === 0 && (
                  <p className="mt-6 text-center text-xs text-white/40">
                    {gifQuery.trim() ? "No GIFs found." : "Loading trending…"}
                  </p>
                )}
              </div>
              <p className="border-t border-white/10 py-1 text-center text-[9px] uppercase tracking-wide text-white/30">
                {gifLoading ? "Searching…" : "Powered by Klipy"}
              </p>
            </div>
          )}
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

          <div ref={listRef} className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-2">
            {messages.length === 0 ? (
              <p className="mt-4 text-center text-xs text-white/40">
                No messages yet. Say hello! 👋
              </p>
            ) : (
              <ul className="flex flex-col gap-3">{rows}</ul>
            )}
          </div>

          <div className="border-t border-white/10 px-2 py-2">
            <div className="relative flex items-end gap-2">
              {emojiOpen && (
                <div className="absolute bottom-full left-0 z-10 mb-2 grid w-full grid-cols-8 gap-1 rounded-xl border border-white/15 bg-neutral-800 p-2 shadow-xl">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      aria-label={`Insert ${emoji}`}
                      className="rounded-lg py-1 text-lg leading-none hover:bg-white/15"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  setGifOpen(false);
                }}
                aria-label={emojiOpen ? "Hide emojis" : "Add emoji"}
                aria-expanded={emojiOpen}
                className={`shrink-0 rounded-full px-2 py-2 text-lg leading-none ${
                  emojiOpen ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                }`}
              >
                🙂
              </button>
              {gifConfigured !== false && (
                <button
                  type="button"
                  onClick={() => {
                    setGifOpen((v) => !v);
                    setEmojiOpen(false);
                  }}
                  aria-label={gifOpen ? "Hide GIFs" : "Add GIF"}
                  aria-expanded={gifOpen}
                  className={`shrink-0 rounded-full px-2.5 py-2 text-xs font-bold leading-none tracking-wide ${
                    gifOpen ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                  }`}
                >
                  GIF
                </button>
              )}
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
                name="table-chat-message"
                autoComplete="off"
                autoCorrect="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
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
