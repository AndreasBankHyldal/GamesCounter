// Small synthesised sound effects (Web Audio — no audio files to bundle).
// Browsers only allow audio after a user gesture, so the first sound on a fresh
// page may be silent until the player taps something; everything after plays.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

interface Note {
  freq: number;
  /** Start offset in seconds (default 0). */
  at?: number;
  /** Duration in seconds (default 0.18). */
  dur?: number;
  type?: OscillatorType;
  /** Peak gain (default 0.16). */
  gain?: number;
}

function play(notes: Note[]): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const now = audio.currentTime;
  for (const n of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    const start = now + (n.at ?? 0);
    const dur = n.dur ?? 0.18;
    const vol = n.gain ?? 0.16;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }
}

/** It's your turn — friendly ascending pling. */
export const playTurnChime = () => play([{ freq: 880 }, { freq: 1318.51, at: 0.11 }]);

/** Drew a single card — soft pluck. */
export const playDraw = () => play([{ freq: 540, dur: 0.08, type: "triangle" }]);

/** Took the whole face-up pile — a little downward sweep. */
export const playPile = () =>
  play([
    { freq: 360, dur: 0.16, type: "sawtooth", gain: 0.12 },
    { freq: 250, at: 0.07, dur: 0.18, type: "sawtooth", gain: 0.11 },
  ]);

/** Laid down a new meld — happy major triad. */
export const playMeld = () =>
  play([{ freq: 523.25 }, { freq: 659.25, at: 0.08 }, { freq: 783.99, at: 0.16 }]);

/** Added cards to an existing run — light two-note blip. */
export const playAdd = () =>
  play([
    { freq: 740, dur: 0.09, type: "triangle" },
    { freq: 988, at: 0.06, dur: 0.09, type: "triangle" },
  ]);

/** Swapped a real card for a joker — quick two-tone. */
export const playSwap = () =>
  play([{ freq: 620, dur: 0.07 }, { freq: 500, at: 0.06, dur: 0.08 }]);

/** Discarded a card — soft tap. */
export const playDiscard = () => play([{ freq: 400, dur: 0.1, type: "triangle", gain: 0.14 }]);

/** Closed the hand — rising flourish. */
export const playClose = () =>
  play([{ freq: 660 }, { freq: 880, at: 0.09 }, { freq: 1174.66, at: 0.18, dur: 0.22 }]);

/** Passed / ended the turn — single mellow note. */
export const playPass = () => play([{ freq: 466.16, dur: 0.12, type: "triangle" }]);

/** Dealing the next round — quick riffle. */
export const playDeal = () =>
  play([
    { freq: 300, dur: 0.05 },
    { freq: 340, at: 0.05, dur: 0.05 },
    { freq: 380, at: 0.1, dur: 0.05 },
    { freq: 420, at: 0.15, dur: 0.05 },
  ]);

/** Game over — short victory fanfare. */
export const playWin = () =>
  play([
    { freq: 523.25 },
    { freq: 659.25, at: 0.12 },
    { freq: 783.99, at: 0.24 },
    { freq: 1046.5, at: 0.36, dur: 0.4 },
  ]);
