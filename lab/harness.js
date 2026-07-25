// Harness: drives the SHIPPING engine, extracted straight out of index.html.
// Nothing here re-implements the model — if the page changes, this follows.
const fs = require("fs");
const path = require("path");

const PAGE = process.env.HOLLER_PAGE || path.join(__dirname, "..", "index.html");
const SR = 44100;

function loadPage() {
  const html = fs.readFileSync(PAGE, "utf8");
  // The engine is a file now. Read it; do not re-derive it.
  let worklet = fs.readFileSync(path.join(__dirname, "..", "engine", "tract-worklet.js"), "utf8");
  // A hook for sweeping a constant without editing the page:  HOLLER_PATCH="a=>b"
  if (process.env.HOLLER_PATCH) {
    const [find, repl] = process.env.HOLLER_PATCH.split("=>");
    if (!worklet.includes(find)) throw new Error("HOLLER_PATCH found nothing: " + find);
    worklet = worklet.split(find).join(repl);
  }
  // The phoneme layer is a file too. This used to be fifteen regular expressions pulling ART,
  // the class tables, the voices and articulate() back out of index.html — and then plan()
  // below re-implemented buildWord on top of them. Both are gone: same file, same objects,
  // same code path as the page.
  const PH = require(path.join(__dirname, "..", "engine", "phonemes.js"));
  return { html, worklet, ...PH };
}

const P = loadPage();

// ─── DETERMINISM AND MEMOISATION ─────────────────────────────────────────────
// The engine calls Math.random() nine times per sample, so two renders of the same word were
// never the same audio. Everything downstream inherited that: bands had to be wide enough to
// cover the spread, a check measuring a noise source once was a coin flip, and the lab README
// records a bit-exact buffer comparison that could not work for exactly this reason.
//
// The fix the README already prescribes — "seed the RNG before comparing two builds" — but
// applied by DEFAULT and RESET PER RENDER rather than once at startup. Per-render matters:
// seeded once, render N depends on renders 1..N-1, so the answer would depend on which checks
// ran first and in which order the job pool happened to schedule them. Reset per render, every
// render is a pure function of its arguments.
//
// That purity is what makes the cache below sound. It is not an optimisation bolted onto a
// random process; it is the same call returning the same answer.
//
// HOLLER_SEED=n   pick a different seed
// HOLLER_SEEDS=k  sweep k seeds and require the verdict to agree (see check.js)
const BASE_SEED = (process.env.HOLLER_SEED ? +process.env.HOLLER_SEED : 20260724) >>> 0;
let SEED = BASE_SEED, seedNow = BASE_SEED;
function setSeed(x) { SEED = x >>> 0; CACHE.clear(); }        // a new seed invalidates renders
function reseed() { seedNow = SEED; }
Math.random = () => { seedNow = (seedNow*1664525 + 1013904223) >>> 0; return seedNow/4294967296; };

// 99 sustain() calls across the gate resolve to 31 distinct renders, and 29 say() calls to 24.
// Two thirds of the sustain work was the same audio computed again.
const CACHE = new Map();
function memo(key, make) {
  if (CACHE.has(key)) return CACHE.get(key);
  reseed();
  const v = make();
  CACHE.set(key, v);
  return v;
}

function makeProcessor(n) {
  global.sampleRate = SR;
  global.AudioWorkletProcessor = class { constructor(){ this.port = { onmessage:null, postMessage(){} }; } };
  let Proc = null;
  global.registerProcessor = (name, cls) => { Proc = cls; };
  eval(P.worklet);
  return new Proc({ processorOptions: { n, velar: P.VELAR } });
}

/** Sustain one phoneme and return the audio. Memoised; see the note above makeProcessor. */
function sustain(sym, opts = {}) {
  const { n = 44, seconds = 1.2, voice = null, f0 = 110 } = opts;
  return memo("s|" + JSON.stringify([sym, n, seconds, f0, voice]), () => sustainRaw(sym, opts));
}
function sustainRaw(sym, { n = 44, seconds = 1.2, voice = null, f0 = 110 } = {}) {
  const p = makeProcessor(n);
  const v = { ...P.defaultVoice(), ...(voice || {}) };
  p.port.onmessage({ data: { type: "voice", v } });
  p.port.onmessage({ data: { type: "shape",
      diam: P.articulate(P.ART[sym] || (P.DIPH[sym] && P.ART[P.DIPH[sym][0]]) || P.ART["ə"], n),
      br: P.BRANCHED[sym] || 0, nz: P.NASAL[sym] || 0,
      fr: P.FRICATIVE[sym] || 0, vl: P.VOICELESS[sym] || 0,
      as: P.ASPIRATE[sym] || 0, snap: true } });
  p.voicing = 1; p.vAmp = 1; p.flow = 1; p.flowT = 1; p.f0 = f0;
  const blocks = Math.ceil(seconds * SR / 128);
  const buf = new Float64Array(blocks * 128), out = [new Float32Array(128)];
  for (let b = 0; b < blocks; b++) { p.process([], [out]); for (let i = 0; i < 128; i++) buf[b*128+i] = out[0][i]; }
  return buf;
}

/** Build the same keyframes the page builds for a word. */
function plan(chain, D, voice, n, stress) {
  const v = { ...P.defaultVoice(), ...(voice || {}) };
  // n MUST match the processor. Hardcoding 44 while the tract was 50 left the last six
  // diameters undefined and the whole voice came out NaN.
  n = n || Math.round(v.sect || 44);
  // This used to be a hand-written copy of buildWord, and the comment here used to say that
  // the harness having its own slightly different copy was exactly how a gate ends up testing
  // the wrong thing. It now calls the same buildWord the page calls. Verified before the copy
  // was deleted: 64 word x voice combinations, keyframes and segments identical to 1e-12.
  // open is 0 because plan never modelled the shouted vowel opening; that is unchanged here
  // deliberately, so no gate band moves. The app still passes its own open.
  // 8.1b. `rate` sizes the word from its own weights; D is still passed so a caller that wants
  // an explicit length — the duration slider, the goal cry — can still ask for one, and so the
  // stretch factor below has something to be relative to.
  const W = P.buildWord(chain, { D, rate: P.rateFor(chain, D, v),
                                 drawl: v.drawl, glide: v.glide, stopHold: v.stopT,
                                 open: 0, n, art: null, stress, pros: v });
  return { keys: W.keys, seg: W.seg, end: W.end, v };
}

/** Speak a word and return audio plus the segment map. Memoised. */
// `extra` is trailing silence, and with a seeded engine a short render is a bit-exact PREFIX
// of a long one. So it is kept OUT of the cache key: render once at the longest tail anyone
// asks for and hand back a slice. Three checks walk the same word list and differ only in how
// much tail they want; without this, one of them pays full price for audio the other two have
// already computed.
function say(chain, opts = {}) {
  const { D = null, voice = null, n = 44, extra = 0.9, stress = null } = opts;
  // stress belongs in the key. It changes the audio from 8.3 onward — an unstressed syllable
  // is quieter — so a render cached without it would come back at the wrong level.
  const key = "w|" + JSON.stringify([chain, D, n, voice, stress]);
  let ent = CACHE.get(key);
  if (!ent || ent.extra < extra) {
    const need = Math.max(extra, ent ? ent.extra : 0.9);
    reseed();
    ent = { ...sayRaw(chain, { ...opts, extra: need }), extra: need };
    CACHE.set(key, ent);
  }
  // Reproduce sayRaw's block rounding exactly, or the slice is not the render.
  const want = Math.ceil((ent.end + extra) * SR / 128) * 128;
  return { buf: ent.buf.length <= want ? ent.buf : ent.buf.subarray(0, want),
           seg: ent.seg, end: ent.end };
}
function sayRaw(chain, { D = null, voice = null, n = 44, extra = 0.9, stress = null } = {}) {
  const vv = { ...P.defaultVoice(), ...(voice || {}) };
  if (n === 44 && vv.sect) n = Math.round(vv.sect);      // follow the voice unless told otherwise
  const dur = D !== null ? D : Math.max(0.5, Math.min(2.2, chain.length*(vv.per||0.17)));
  const { keys, seg, end, v } = plan(chain, dur, voice, n, stress);
  const p = makeProcessor(n);
  p.port.onmessage({ data: { type: "voice", v } });
  const f0 = P.buildF0(end, v, { stress, seg });
  p.port.onmessage({ data: { type: "goal", seq: { keys, f0, end } } });
  const blocks = Math.ceil((end + extra) * SR / 128);
  const buf = new Float64Array(blocks*128), out = [new Float32Array(128)];
  for (let b = 0; b < blocks; b++) { p.process([], [out]); for (let i = 0; i < 128; i++) buf[b*128+i] = out[0][i]; }
  return { buf, seg, end };
}

// ---- measurement ----
const rms = (x, a, b) => {
  let s = 0, c = 0;
  for (let i = Math.max(0,Math.floor(a*SR)); i < Math.min(x.length, Math.floor(b*SR)); i++) { s += x[i]*x[i]; c++; }
  return Math.sqrt(s / Math.max(1, c));
};

/** Averaged magnitude spectrum — averaging matters, noise-excited sounds need it. */
function spectrum(x, { from = 0.4, lo = 500, hi = 10000, step = 250, win = 2048, hops = 24 } = {}) {
  const start = Math.floor(x.length * from);
  const freqs = []; for (let f = lo; f <= hi; f += step) freqs.push(f);
  const acc = freqs.map(() => 0);
  let used = 0;
  for (let h = 0; h < hops; h++) {
    const st = start + h*win;
    if (st + win >= x.length) break;
    used++;
    freqs.forEach((f, k) => {
      let re = 0, im = 0;
      for (let i = 0; i < win; i++) {
        const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/win);
        const a = 2*Math.PI*f*i/SR;
        re += x[st+i]*w*Math.cos(a); im -= x[st+i]*w*Math.sin(a);
      }
      acc[k] += re*re + im*im;
    });
  }
  return freqs.map((f, k) => [f, 10*Math.log10(acc[k]/Math.max(1,used) + 1e-20)]);
}

const peakOf = (sp) => { const mx = Math.max(...sp.map(a=>a[1])); return { f: sp.find(a=>a[1]===mx)[0], db: mx }; };

/** Energy-weighted mean frequency. On a NOISE source the peak is close to useless — one bin
 *  wins by chance, and /θ/ measured anywhere from 1100 to 3500 Hz across twelve renders. The
 *  centroid averages the whole spectrum and barely moves. Use it for anything stochastic. */
const centroid = (sp, lo = 0, hi = 1e9) => {
  let num = 0, den = 0;
  for (const [f, db] of sp) {
    if (f < lo || f > hi) continue;
    const p = Math.pow(10, db/10);
    num += f*p; den += p;
  }
  return den > 0 ? num/den : 0;
};

/** Averaged centroid — the stable way to ask "where does this sound sit". */
function bandOf(sym, { n = 44, k = 3, seconds = 1.0, lo = 300, hi = 9000 } = {}) {
  let a = 0;
  for (let i = 0; i < k; i++) {
    a += centroid(spectrum(sustain(sym, { n, seconds }), { lo, hi, step: 200, hops: 10 }), lo, hi);
  }
  return a/k;
}
const bandShare = (sp, lo, hi) => {
  let inb = 0, tot = 0;
  for (const [f, m] of sp) { const p = Math.pow(10, m/10); tot += p; if (f >= lo && f <= hi) inb += p; }
  return inb/tot*100;
};

/** Formants via LPC on the tract's impulse response — the transfer function, not the output.
 *  (Voiced-signal LPC has misled this project five times. Do not use it for formants.) */
function formants(sym, { n = 44, order = 12, art = null } = {}) {
  const { Tract } = require("./tract.js");
  // SIZED TO n. This built a default-length Tract and then wrote n diameters into it, so any
  // n below the default left stale values in the tail and any n above it threw. Every
  // measurement taken at a length other than 44 was of a tract that was not that length.
  const t = new Tract(n);
  // `art` overrides a posture. Without it this could only ever measure the shared ART table,
  // so a voice with FITTED postures — john and johncry, the only two — had never been checked
  // against any target at all. Which is a poor place for the one voice measured from a real
  // person to be, and it is the one reported as the worst of the set.
  t.diam.set(P.articulate((art && art[sym]) || P.ART[sym], n));
  // Measure a branched phoneme the way it is HEARD — with its pocket open. Measuring /l/
  // with the branch shut hid the fact that the branch was turning it into an /r/.
  t.bOpen = P.BRANCHED[sym] || 0;
  t.calcReflections();
  const L = 8192, ir = new Float64Array(L);
  ir[0] = t.sample(1); for (let i = 1; i < L; i++) ir[i] = t.sample(0);
  const pk = []; let a = 0, b = 0;
  // STEP 40, not 10. The impulse response has to stay 8192 long — at 4096 the peaks of a
  // high-Q shape smear and /ŋ/ lands 910 Hz out — but the frequency STEP is not what limits
  // accuracy, and coarsening it is close to free: measured across sixteen postures, 8192/40
  // disagrees with 8192/10 by at most 20 Hz, which is an order of magnitude inside the
  // tightest tolerance in consonant-targets.json. 123 ms becomes 34.
  //
  // Worth having because this is a search objective now, and 123 ms makes a solver take nine
  // minutes. The obvious alternative — the LPC in fit-preset.js, fifty times quicker — was
  // tried and is not usable: it returns NOTHING at n=52 and n=60, and `barry` is 48.
  for (let f = 180; f <= 3400; f += 40) {
    let re = 0, im = 0;
    for (let i = 0; i < L; i++) {
      const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/L);
      const q = 2*Math.PI*f*i/SR;
      re += ir[i]*w*Math.cos(q); im -= ir[i]*w*Math.sin(q);
    }
    const m = Math.hypot(re, im);
    if (b > a && b > m) pk.push(f - 10);
    a = b; b = m;
  }
  return pk.slice(0, 3);
}

/** Largest transient relative to the signal's own normal motion. */
function outlier(x, from = 0.3, to = 0.6) {
  // The reference window must sit INSIDE the sound. Measured against a silent tail the
  // noise floor becomes the yardstick and every transient looks like a 900x click.
  const j = [];
  for (let i = Math.floor(x.length*from)+1; i < Math.floor(x.length*to); i++) j.push(Math.abs(x[i]-x[i-1]));
  j.sort((a,b)=>a-b);
  const norm = j[Math.floor(j.length*0.98)] || 1e-9;
  let mx = 0, at = 0;
  for (let i = 1; i < x.length; i++) { const d = Math.abs(x[i]-x[i-1])/norm; if (d > mx) { mx = d; at = i/SR; } }
  return { ratio: mx, at };
}

module.exports = { P, SR, sustain, say, plan, setSeed, BASE_SEED, rms, spectrum, peakOf, centroid, bandOf, bandShare, formants, outlier, makeProcessor };
