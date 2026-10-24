// Shared JS around master.wasm, used by the web page, the AudioWorklet and
// the Node test. Plain ES module, no dependencies.

export const STYLES = [
  { name: "Universal", blurb: "Balanced tone and gentle glue for any mix" },
  { name: "Fire", blurb: "Punchy lows and forward mids for rock and punk" },
  { name: "Clarity", blurb: "Open, airy top end, light touch on dynamics" },
  { name: "Tape", blurb: "Warm saturation and a rounded top" },
  { name: "Natural", blurb: "Barely there: light glue, keeps the dynamics" },
  { name: "Spatial", blurb: "Wide stereo and a touch of air and ambience" },
  { name: "Cinematic", blurb: "Big, saturated and wide" },
  { name: "Punch", blurb: "Energetic bass and bright highs" },
];

export const TARGETS = [
  { name: "Streaming", lufs: -14 },
  { name: "Balanced", lufs: -11 },
  { name: "Loud", lufs: -9 },
];

const BLOCK = 512;

// The module is "standalone" WebAssembly: whatever few system imports it
// asks for get harmless stubs.
export async function instantiate(wasmBytesOrModule) {
  const module = wasmBytesOrModule instanceof WebAssembly.Module ? wasmBytesOrModule : await WebAssembly.compile(wasmBytesOrModule);
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    imports[imp.module] ??= {};
    imports[imp.module][imp.name] = imp.kind === "function" ? () => 0 : undefined;
  }
  const instance = await WebAssembly.instantiate(module, imports);
  if (instance.exports._initialize) instance.exports._initialize();
  return instance.exports;
}

function applySettings(x, h, s) {
  const eq = s.tone ?? [0, 0, 0, 0, 0], ref = s.refTone ?? [0, 0, 0, 0, 0];
  const t = eq.map((v, k) => v + ref[k]); // reference matching adds to the EQ
  x.mc_settings(h, s.style ?? 0, s.intensity ?? 0.6, s.inputDb ?? 0, s.targetLufs ?? -14, s.ceilingDb ?? -1,
    s.glue ?? 0.5, s.width ?? 0, s.sat ?? 0, t[0], t[1], t[2], t[3], t[4]);
}

export async function loadMaster(wasmBytesOrModule) {
  const x = await instantiate(wasmBytesOrModule);
  const f32 = () => new Float32Array(x.memory.buffer);

  function withInstance(fs, fn) {
    const h = x.mc_create(fs, BLOCK);
    try { return fn(h); } finally { x.mc_destroy(h); }
  }

  // feed [from, to) of l/r through instance h; optionally collect output
  function run(h, l, r, from, to, outL, outR, outOffset = 0) {
    const pl = x.mc_left(h) >> 2, pr = x.mc_right(h) >> 2;
    for (let i = from; i < to; i += BLOCK) {
      const n = Math.min(BLOCK, to - i), mem = f32();
      for (let k = 0; k < n; k++) { mem[pl + k] = i + k < l.length ? l[i + k] : 0; mem[pr + k] = i + k < r.length ? r[i + k] : 0; }
      x.mc_process(h, n);
      if (outL) {
        const m2 = f32();
        for (let k = 0; k < n; k++) {
          const o = i + k - outOffset;
          if (o >= 0 && o < outL.length) { outL[o] = m2[pl + k]; outR[o] = m2[pr + k]; }
        }
      }
    }
  }

  // Loudest stretch of the song (the chorus, usually), by RMS per second
  function loudestWindow(l, r, fs, seconds) {
    const per = Math.floor(fs), secs = Math.floor(l.length / per), energy = new Float64Array(secs);
    for (let s = 0; s < secs; s++) {
      let e = 0;
      for (let i = s * per; i < (s + 1) * per; i += 4) e += l[i] * l[i] + r[i] * r[i];
      energy[s] = e;
    }
    const w = Math.min(seconds, secs);
    let best = 0, bestE = -1, acc = 0;
    for (let s = 0; s < secs; s++) {
      acc += energy[s];
      if (s >= w) acc -= energy[s - w];
      if (s >= w - 1 && acc > bestE) { bestE = acc; best = s - w + 1; }
    }
    return best * per;
  }

  return {
    // Listen to the song's loudest 21 s, like pressing Listen during the
    // chorus. Returns what was learned.
    learnOffline(l, r, fs, settings) {
      return withInstance(fs, (h) => {
        applySettings(x, h, settings);
        x.mc_learn(h);
        // Same as pressing Listen during the chorus: start right at the loudest stretch
        const start = loudestWindow(l, r, fs, 21);
        run(h, l, r, start, Math.min(l.length, start + 21 * fs));
        x.mc_finish_learning(h); // songs shorter than the learn time
        const learned = [];
        for (let i = 0; i < 11; i++) learned.push(x.mc_learned(h, i));
        return learned;
      });
    },

    // Master the whole song with fixed (learned) settings. Output is
    // latency-compensated so it lines up with the original.
    renderOffline(l, r, fs, settings, learned) {
      return withInstance(fs, (h) => {
        applySettings(x, h, settings);
        x.mc_lock_learned(h, ...learned.slice(1));
        const lat = x.mc_latency(h);
        const outL = new Float32Array(l.length), outR = new Float32Array(r.length);
        run(h, l, r, 0, l.length + lat, outL, outR, lat);
        return [outL, outR];
      });
    },

    // Same as renderOffline, but a step at a time (a generator), so a worker
    // can draw progress and abandon the render when settings change again.
    *renderSteps(l, r, fs, settings, learned, outL, outR, stepSamples) {
      const h = x.mc_create(fs, BLOCK);
      try {
        applySettings(x, h, settings);
        x.mc_lock_learned(h, ...learned.slice(1));
        const lat = x.mc_latency(h), total = l.length + lat;
        for (let pos = 0; pos < total; pos += stepSamples) {
          const end = Math.min(total, pos + stepSamples);
          run(h, l, r, pos, end, outL, outR, lat);
          yield Math.max(0, Math.min(l.length, end - lat)); // output samples finished
        }
      } finally { x.mc_destroy(h); }
    },

    // Streaming services measure the *whole* song. Learning sets loudness
    // from the loudest stretch, so a dynamic song (quiet verses) ends up a
    // little under target overall. Render, measure the whole song, nudge the
    // drive, render again: lands within a few tenths of the target.
    renderToTarget(l, r, fs, settings, learned, onProgress) {
      let tuned = learned.slice(), out = null, lufs = -100;
      for (let pass = 0; pass < 3; pass++) {
        onProgress?.(pass);
        out = this.renderOffline(l, r, fs, settings, tuned);
        lufs = integratedLufs(out[0], out[1], fs);
        const err = (settings.targetLufs ?? -14) - lufs;
        if (Math.abs(err) < 0.25) break;
        tuned = tuned.slice();
        tuned[2] = Math.max(-6, Math.min(24, tuned[2] + err));
      }
      return { out, lufs, learned: tuned };
    },

    // Integrated loudness (LUFS) of a stereo buffer
    measureLufs: (l, r, fs) => integratedLufs(l, r, fs),

    // Calibration only: change a style's voicing (all instances in this module)
    overrideStyle(style, v) {
      x.mc_override_style(style, ...v.tone, ...v.comp, v.sat, v.width, v.monoHz);
    },

    // A live instance for an AudioWorklet (128-sample blocks)
    createRealtime(fs) {
      const h = x.mc_create(fs, 128);
      const pl = x.mc_left(h) >> 2, pr = x.mc_right(h) >> 2;
      return {
        latency: x.mc_latency(h),
        settings: (s) => applySettings(x, h, s),
        lockLearned: (learned) => x.mc_lock_learned(h, ...learned.slice(1)),
        learn: () => x.mc_learn(h),
        get: (what) => x.mc_get(h, what),
        process(l, r) {
          const n = l.length, mem = f32();
          mem.set(l, pl); mem.set(r, pr);
          x.mc_process(h, n);
          const m2 = f32();
          l.set(m2.subarray(pl, pl + n)); r.set(m2.subarray(pr, pr + n));
        },
      };
    },
  };
}

// BS.1770 integrated loudness in plain JS (for reports and tests)
export function integratedLufs(l, r, fs) {
  const kw = (ch) => {
    // K-weighting, coefficients computed for this sample rate
    let K = Math.tan(Math.PI * 1681.974450955533 / fs);
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416), Q = 0.7071752369554196;
    let a0 = 1 + K / Q + K * K;
    const s = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
    K = Math.tan(Math.PI * 38.13547087602444 / fs);
    const Q2 = 0.5003270373238773;
    a0 = 1 + K / Q2 + K * K;
    const hp = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0];
    const out = new Float64Array(ch.length);
    let z1 = 0, z2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < ch.length; i++) {
      const x0 = ch[i];
      const y = s[0] * x0 + z1; z1 = s[1] * x0 - s[3] * y + z2; z2 = s[2] * x0 - s[4] * y;
      const o = hp[0] * y + y1; y1 = hp[1] * y - hp[3] * o + y2; y2 = hp[2] * y - hp[4] * o;
      out[i] = o;
    }
    return out;
  };
  const kl = kw(l), kr = kw(r), block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const blocks = [];
  for (let s = 0; s + block <= kl.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + block; i++) e += kl[i] * kl[i] + kr[i] * kr[i];
    blocks.push(-0.691 + 10 * Math.log10(e / block + 1e-20));
  }
  const gated = (thr) => blocks.filter((b) => b > thr);
  const mean = (arr) => -0.691 + 10 * Math.log10(arr.reduce((a, b) => a + Math.pow(10, (b + 0.691) / 10), 0) / Math.max(1, arr.length));
  const abs = gated(-70);
  if (!abs.length) return -100;
  return mean(gated(Math.max(-70, mean(abs) - 10)));
}
