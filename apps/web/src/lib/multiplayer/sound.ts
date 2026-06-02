// A short "pling" played when it becomes your turn. Synthesised with the Web
// Audio API so there's no audio file to bundle. Browsers only allow audio after
// a user gesture, so the very first turn may be silent until the player taps
// something — every turn after that chimes.

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

/** Two quick ascending notes — a friendly "pling". */
export function playTurnChime(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

  const now = audio.currentTime;
  const notes = [
    { freq: 880, at: 0 }, // A5
    { freq: 1318.51, at: 0.11 }, // E6
  ];
  for (const { freq, at } of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  }
}
