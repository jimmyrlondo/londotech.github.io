// How streaming services play a song back: each normalizes to its own
// reference loudness. Some only turn loud songs down; others also turn quiet
// songs up, but only as far as the peaks allow (no limiter). Approximate:
// services change these, so the page labels them as estimates.
export const PLATFORMS = [
  { id: "spotify", name: "Spotify", ref: -14, up: true },
  { id: "apple", name: "Apple Music", ref: -16, up: true },
  { id: "youtube", name: "YouTube", ref: -14, up: false },
  { id: "tidal", name: "TIDAL", ref: -14, up: false },
  { id: "amazon", name: "Amazon Music", ref: -14, up: false },
  { id: "deezer", name: "Deezer", ref: -15, up: true },
  { id: "pandora", name: "Pandora", ref: -14, up: true },
];

// Gain (dB) the platform applies to a song with this loudness and true peak
export function platformGain(p, lufs, peakDb) {
  const want = p.ref - lufs;
  if (want <= 0) return want;            // too loud: turned down
  if (!p.up) return 0;                    // quiet, and this service never turns up
  return Math.max(0, Math.min(want, -1 - peakDb)); // turned up only into the peak headroom
}

// Playback devices, as Web Audio filter chains
export const DEVICES = [
  { id: "studio", name: "Studio", filters: [], mono: false },
  { id: "phone", name: "Phone speaker", mono: true, filters: [
    { type: "highpass", frequency: 450, Q: 0.9 }, { type: "peaking", frequency: 2500, Q: 1.2, gain: 5 },
    { type: "lowpass", frequency: 9000, Q: 0.7 } ] },
  { id: "laptop", name: "Laptop", mono: false, filters: [
    { type: "highpass", frequency: 200, Q: 0.8 }, { type: "peaking", frequency: 1800, Q: 1, gain: 3 },
    { type: "lowpass", frequency: 13000, Q: 0.7 } ] },
  { id: "earbuds", name: "Earbuds", mono: false, filters: [
    { type: "highpass", frequency: 40, Q: 0.7 }, { type: "lowshelf", frequency: 120, gain: 2 },
    { type: "peaking", frequency: 6000, Q: 2, gain: 3 } ] },
  { id: "car", name: "Car", mono: false, filters: [
    { type: "lowshelf", frequency: 90, gain: 5 }, { type: "peaking", frequency: 300, Q: 1.5, gain: 2 },
    { type: "highshelf", frequency: 7000, gain: -4 } ] },
];
