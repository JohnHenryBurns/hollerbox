#!/usr/bin/env node
/**
 * Fit the gesture parameters against targets.
 *
 *   node lab/fit-dynamics.js               fit against the literature
 *   node lab/fit-dynamics.js --check       recover a planted answer, and stop
 *
 * The Phase 9 parameters — artT, artCrit, artStiff, artPush — were set by ear and by what did
 * not break. This searches them against measurements whose right answers are published, so the
 * dynamics stop being a matter of taste.
 *
 * Every target here is a NUMBER FROM SOMEWHERE, not a preference:
 *
 *   Lindblom (1963)   a vowel shortened undershoots its formant target, and by how much is
 *                     measured. This is the single strongest constraint on artT, because it is
 *                     the only one that says how much the tract should FAIL to arrive.
 *   Klatt (1975)      VOT ~58/70/80 ms for /p t k/ and under ~20 for /b d g/.
 *   constitutive      a stop closure must close and a fricative channel must stay open enough
 *                     for a jet. Not a preference either: below them the sound is a different
 *                     sound, which is why they are weighted hardest.
 *
 * Formants come from the transfer function of the area function, never from LPC on the voiced
 * signal — that route has misled this project five times and the harness says so at the top of
 * `formants`.
 */
const H = require("./harness.js");
const P = H.P;
const { Tract } = require("./tract.js");

const CANON = {};
const VOICE = { ...P.defaultVoice(), ...P.VOICES.john.v };
const N = Math.round(VOICE.sect);

/** Resonances of whatever shape the tract is in, from its impulse response. */
function formantsOfShape(diam, n) {
  const t = new Tract();
  t.diam.set(diam.subarray ? diam.subarray(0, n) : diam.slice(0, n));
  t.calcReflections();
  const L = 2048, ir = new Float64Array(L);
  ir[0] = t.sample(1);
  for (let i = 1; i < L; i++) ir[i] = t.sample(0);
  const pk = [];
  let a = 0, b = 0;
  for (let f = 200; f <= 3200; f += 20) {
    let re = 0, im = 0;
    for (let i = 0; i < L; i += 4) {
      const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/L), q = 2*Math.PI*f*i/H.SR;
      re += ir[i]*w*Math.cos(q); im -= ir[i]*w*Math.sin(q);
    }
    const m = Math.hypot(re, im);
    if (b > a && b > m) pk.push(f - 20);
    a = b; b = m;
  }
  return pk;
}

/** Run a chain and hand back what the tract was doing, sampled. */
function trace(chain, v, D) {
  const W = P.buildWord(chain, { D, n: N, pros: v, glide: v.glide,
                                 stopHold: v.stopT, drawl: v.drawl });
  const p = H.makeProcessor(N);
  p.port.onmessage({ data: { type: "voice", v } });
  p.port.onmessage({ data: { type: "goal",
    seq: { keys: W.keys, f0: P.buildF0(W.end, v), end: W.end } } });
  const out = [new Float32Array(128)];
  const shots = [];
  for (let b = 0; b < Math.ceil(W.end*H.SR/128); b++) {
    p.process([], [out]);
    shots.push({ t: b*128/H.SR, diam: Float64Array.from(p.diam.subarray(0, N)),
                 burst: p.burstN, vot: p.vot });
  }
  return { W, shots };
}

const narrowestIn = (shots, seg) => {
  let mn = 9;
  for (const s of shots) {
    if (s.t < seg.a || s.t > seg.b) continue;
    for (let i = 1; i < N-1; i++) if (s.diam[i] < mn) mn = s.diam[i];
  }
  return mn;
};

/** ---- the targets ---- */
function measure(v) {
  const m = {};

  // constitutive: a closure closes, a fricative channel stays open enough to whistle
  for (const sym of ["d", "k"]) {
    const { W, shots } = trace(["ɑ", sym, "ɑ"], v, 0.9);
    m["seal_" + sym] = narrowestIn(shots, W.seg.find(s => s.sym === sym));
  }
  for (const sym of ["z"]) {
    const { W, shots } = trace(["ɑ", sym, "ɑ"], v, 0.9);
    m["chan_" + sym] = narrowestIn(shots, W.seg.find(s => s.sym === sym));
  }

  // Lindblom: how much a vowel undershoots when it is given less time. Measured on the tract's
  // own transfer function at the vowel's midpoint — the shape it actually reached, against the
  // shape it was aiming at.
  for (const [sym, D] of [["ɛ", 1.2], ["ɛ", 0.5]]) {
    const { W, shots } = trace(["d", sym, "d"], v, D);
    const seg = W.seg.find(s => s.sym === sym);
    const mid = shots.reduce((best, s) =>
      Math.abs(s.t - (seg.a+seg.b)/2) < Math.abs(best.t - (seg.a+seg.b)/2) ? s : best, shots[0]);
    const got = formantsOfShape(mid.diam, N);
    // The canonical target does not depend on the voice being scored, so it is computed once.
    // It was being recomputed on every candidate, which is most of what made a score cost 11 s.
    CANON[sym] = CANON[sym] || formantsOfShape(P.articulate(P.ART[sym], N), N);
    const want = CANON[sym];
    if (got.length >= 2 && want.length >= 2)
      m["F2_" + D] = got[1] / want[1];        // 1.0 = arrived, < 1 = fell short
  }

  // Klatt: voice onset time
  const votOf = sym => {
    const { W, shots } = trace(["ɑ", sym, "ɑ"], v, 0.9);
    let prev = 0, at = null;
    for (const s of shots) { if (s.burst > prev && at === null) at = s.vot/H.SR*1000; prev = s.burst; }
    return at === null ? 0 : at;
  };
  m.vot_k = votOf("k");
  return m;
}

// target, tolerance, weight. Weight 4 on the constitutive ones: a stop that does not close is
// not a worse stop, it is a different sound, and no amount of good timing buys that back.
const TARGETS = [
  ["seal_d", 0.02, 0.12, 4], ["seal_k", 0.02, 0.12, 4],
  ["chan_z", 0.09, 0.06, 4],
  ["F2_1.2", 0.98, 0.04, 2],                     // given time, it should arrive
  ["F2_0.5", 0.82, 0.07, 3],                     // Lindblom: shortened, it should not
  ["vot_k",  80,   22,   1],
];

function score(v) {
  const m = measure(v);
  let e = 0; const rows = [];
  for (const [k, want, tol, w] of TARGETS) {
    const got = m[k];
    if (got === undefined) { e += 10*w; rows.push([k, "—", want, "missing"]); continue; }
    const off = Math.max(0, Math.abs(got - want) - tol) / tol;
    e += w * off * off;
    rows.push([k, got, want, off === 0 ? "ok" : off.toFixed(2) + " out"]);
  }
  return { e, rows, m };
}

const KNOBS = ["artT", "artCrit", "artStiff", "artPush"];
function fit(start, passes = 3) {
  let best = { ...start }, bestE = score(best).e;
  for (let pass = 0; pass < passes; pass++) {
    for (const k of KNOBS) {
      const spec = P.VOICE_SPEC.find(x => x.k === k);
      const span = (spec.hi - spec.lo) / Math.pow(2, pass);
      for (let d = -2; d <= 2; d++) {
        if (!d) continue;
        const val = Math.max(spec.lo, Math.min(spec.hi, best[k] + d*span/4));
        const cand = { ...best, [k]: val };
        const e = score(cand).e;
        if (e < bestE - 1e-9) { best = cand; bestE = e; }
      }
    }
    process.stderr.write(`  pass ${pass+1}: error ${bestE.toFixed(3)}\n`);
  }
  return { best, bestE };
}

if (require.main === module) {
  if (process.argv.includes("--check")) {
    // Recover a planted answer. The roadmap's rule: a metric is not trusted until it has been
    // checked against a case where the answer is independently known.
    const truth = { ...VOICE, artT: 0.040, artCrit: 0.45, artStiff: 0.15, artPush: 0.7 };
    const planted = measure(truth);
    const saved = TARGETS.map(t => t.slice());
    for (const t of TARGETS) if (planted[t[0]] !== undefined) t[1] = planted[t[0]];
    const { best } = fit({ ...VOICE, artT: 0.02, artCrit: 0.8, artStiff: 0.5, artPush: 0.2 }, 3);
    console.log("\nrecovery of a planted answer:\n");
    for (const k of KNOBS)
      console.log(`  ${k.padEnd(9)} truth ${String(truth[k]).padEnd(7)} found ${best[k].toFixed(3)}`);
    saved.forEach((t, i) => TARGETS[i][1] = t[1]);
    process.exit(0);
  }
  const before = score(VOICE);
  process.stderr.write(`\nfitting ${KNOBS.join(" ")} against ${TARGETS.length} targets\n`);
  const { best, bestE } = fit(VOICE, 3);
  const after = score(best);
  console.log("\n  target        now        fitted     want   ");
  for (let i = 0; i < TARGETS.length; i++) {
    const [k, want] = TARGETS[i];
    const f = x => typeof x === "number" ? x.toFixed(3) : String(x);
    console.log("  " + k.padEnd(11) + f(before.rows[i][1]).padStart(9)
                + f(after.rows[i][1]).padStart(11) + f(want).padStart(9)
                + "   " + after.rows[i][3]);
  }
  console.log(`\n  error ${before.e.toFixed(3)} -> ${bestE.toFixed(3)}\n`);
  for (const k of KNOBS)
    console.log(`  ${k.padEnd(9)} ${String(VOICE[k]).padEnd(8)} -> ${best[k].toFixed(3)}`);
}
module.exports = { measure, score, fit, TARGETS };
