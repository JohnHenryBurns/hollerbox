#!/usr/bin/env node
/**
 * Dial the timing knobs against measured targets, automatically.
 *
 *   node lab/fit-auto.js                    fit against the literature
 *   node lab/fit-auto.js --from f.json      fit against a real recording instead
 *   node lab/fit-auto.js --show             just measure, change nothing
 *
 * WHY THIS EXISTS, AND WHY IT ONLY DOES TIMING.
 *
 * A rendered word costs about 4.3 seconds and `buildWord` alone costs 0.24 ms — four orders of
 * magnitude. So anything measurable from the PLAN can be optimised thousands of times over, and
 * anything needing audio can be evaluated a few dozen times at most. Those are different tools
 * and pretending otherwise is how an automated fitter turns into a thing that never finishes.
 * This is the cheap half. The acoustic half wants a much smaller budget and a coarser search.
 *
 * WHY IT IS NOT CIRCULAR. The engine's constants already carry the literature values —
 * CODA_VOICED is 1.50 because House & Fairbanks measured 1.5. But `buildWord` normalises a word
 * to its total duration, so the ratio that actually comes out is not the ratio that went in: the
 * roadmap records the coda effect arriving as 1.20x when 1.50 was asked for. The knobs therefore
 * have to be set to whatever produces the literature ratio AFTER normalisation, and finding that
 * numerically is exactly what this does. It inverts the normalisation instead of guessing at it.
 */
const fs = require("fs");
const path = require("path");
const P = require(path.join(__dirname, "..", "engine", "phonemes.js"));

const T = JSON.parse(fs.readFileSync(path.join(__dirname, "targets.json"), "utf8"));
const VOWELS = new Set(P.VOWEL_KEYS);

/** Build one probe and hand back its segments. `|` separates phones; ` ` is a word boundary. */
function segsOf(spec, v) {
  const chain = spec.split("|");
  const n = Math.round(v.sect);
  const stress = chain.map(c => (VOWELS.has(c) || P.DIPH[c]) ? 1 : 0);
  // one primary, on the first vowel — enough for the ratios here
  let seen = false;
  for (let i = 0; i < stress.length; i++) {
    if (stress[i] && !seen) { stress[i] = 2; seen = true; }
    else if (stress[i]) stress[i] = 0;
  }
  const W = P.buildWord(chain, { D: Math.max(0.45, chain.length * v.per), n, stress,
                                 pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
  return W.seg.filter(s => s.sym !== " ");
}
const dur = s => s.b - s.a;
const firstVowel = segs => segs.find(s => VOWELS.has(s.sym) || P.DIPH[s.sym]);

/**
 * WITHIN-WORD ONLY, and this is the central fact about the model's timing.
 *
 * `buildWord` fixes a word's total from D and then distributes it by weight, so the weights
 * only ever REDISTRIBUTE inside one word. An effect applied equally to every vowel of a word
 * cancels exactly — measured: "bædɪd", both vowels before /d/, renders 193/157 ms with `coda`
 * at 1 and 193/157 with it at 0. Change one coda and it appears: "bædɪt" gives 202/109 against
 * 172/139.
 *
 * So "the vowel in bad against the vowel in bat" — which is how the literature states it and
 * how a recording would measure it — is structurally unreachable, because those are two words
 * and each is normalised on its own. No setting of any knob produces it. That is exactly what
 * roadmap item 8.1b is for: make D a rate and let a word's length emerge from its weights.
 *
 * Every probe below therefore puts its contrast INSIDE one word. Targets that cannot be stated
 * that way are marked unreachable and excluded from the score rather than quietly fitted to.
 */
const MEASURE = {
  within_coda(probes, v) {                 // bædɪt: /æ/ before voiced, /ɪ/ before voiceless
    const vs = segsOf(probes[0], v).filter(s => VOWELS.has(s.sym));
    return vs.length >= 2 ? dur(vs[0])/dur(vs[1]) : null;
  },
  within_vowels(probes, v) {               // hɔdɪd: open vowel against close vowel
    const vs = segsOf(probes[0], v).filter(s => VOWELS.has(s.sym));
    return vs.length >= 2 ? dur(vs[0])/dur(vs[1]) : null;
  },
  within_stress(probes, v) {               // banana, stressed on the SECOND syllable
    const chain = probes[0].split("|");
    const n = Math.round(v.sect);
    const stress = chain.map(() => 0);
    let seen = 0;
    for (let i = 0; i < chain.length; i++)
      if (VOWELS.has(chain[i])) stress[i] = (++seen === 2) ? 2 : 0;
    const W = P.buildWord(chain, { D: Math.max(0.45, chain.length*v.per), n, stress, pros: v,
                                   glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    const vs = W.seg.filter(s => VOWELS.has(s.sym));
    if (vs.length < 3) return null;
    const rest = [vs[0], vs[2]].map(dur);
    return dur(vs[1])/(rest.reduce((a, b) => a + b, 0)/rest.length);
  },
  within_final(probes, v) {                // the last held vowel against the first
    const vs = segsOf(probes[0], v).filter(s => VOWELS.has(s.sym));
    return vs.length >= 2 ? dur(vs[vs.length-1])/dur(vs[0]) : null;
  },
  vowel_ratio(probes, v) {
    const [a, b] = probes.map(p => firstVowel(segsOf(p, v)));
    return (a && b) ? dur(a)/dur(b) : null;
  },
  closure_ratio(probes, v) {
    const pick = p => segsOf(p, v).find(s => P.STOP_KEYS.includes(s.sym));
    const [a, b] = probes.map(pick);
    return (a && b) ? dur(a)/dur(b) : null;
  },
  stress_ratio(probes, v) {
    // the stressed nucleus against the mean of the unstressed ones
    const segs = segsOf(probes[0], v).filter(s => VOWELS.has(s.sym) || P.DIPH[s.sym]);
    if (segs.length < 2) return null;
    const longest = Math.max(...segs.map(dur));
    const rest = segs.map(dur).filter(d => d !== longest);
    return rest.length ? longest/(rest.reduce((x, y) => x + y, 0)/rest.length) : null;
  },
  final_ratio(probes, v) {
    // the same word twice; the second one is utterance-final
    const chain = probes[0].split("|");
    const n = Math.round(v.sect);
    const W = P.buildWord(chain, { D: Math.max(0.45, chain.length*v.per), n,
                                   stress: chain.map(c => VOWELS.has(c) ? 2 : 0),
                                   pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    const vs = W.seg.filter(s => VOWELS.has(s.sym));
    return vs.length >= 2 ? dur(vs[vs.length-1])/dur(vs[0]) : null;
  },
  syllable_ratio(probes, v) {
    // per-syllable duration of the short word against the long one
    const per = p => {
      const segs = segsOf(p, v);
      const syl = segs.filter(s => VOWELS.has(s.sym) || P.DIPH[s.sym]).length || 1;
      return segs.reduce((a, s) => a + dur(s), 0)/syl;
    };
    return per(probes[0])/per(probes[1]);
  },
};

function score(v) {
  let total = 0;
  const rows = [];
  for (const t of T.timing) {
    if (t.reachable === false) { rows.push({ ...t, got: null, err: null, skip: true }); continue; }
    const got = MEASURE[t.measure](t.probe, v);
    if (got === null) { rows.push({ ...t, got: null, err: null }); continue; }
    // normalised by the tolerance, so a target with a wide honest band does not dominate one
    // with a narrow one just because its number is bigger
    const err = (got - t.target)/t.tol;
    total += err*err;
    rows.push({ ...t, got, err });
  }
  return { total, rows };
}

/** Coordinate descent with shrinking steps. The space is small and smooth; this is enough. */
function fit(v0, keys, rounds = 60) {
  let v = { ...v0 }, best = score(v).total;
  let step = 0.45;
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (const k of keys) {
      const spec = P.VOICE_SPEC.find(x => x.k === k);
      if (!spec) continue;
      for (const dir of [1, -1]) {
        const span = spec.hi - spec.lo;
        const cand = { ...v, [k]: Math.max(spec.lo, Math.min(spec.hi, v[k] + dir*step*span)) };
        if (cand[k] === v[k]) continue;
        const s = score(cand).total;
        if (s < best - 1e-9) { v = cand; best = s; moved = true; }
      }
    }
    if (!moved) step *= 0.6;
    if (step < 1e-4) break;
  }
  return { v, best };
}

/**
 * Does each measure respond to its OWN knob, more than to any other?
 *
 * This is the check that should exist before any fitter is trusted, and it did not the first
 * time. The first run "succeeded" — total error 5.91 down to 1.76, every target inside
 * tolerance — by driving `coda` to 0 and `wkdur` to 1. It turned OFF the two knobs whose
 * effects it was supposed to be tuning, and the numbers improved, because the measures were
 * picking up other parameters. That is Goodhart's law with a coordinate descent attached.
 */
function isolation(v0) {
  const rows = [];
  for (const t of T.timing) {
    if (t.reachable === false) continue;
    const base = MEASURE[t.measure](t.probe, v0);
    if (base === null) continue;
    const infl = [];
    for (const spec of P.VOICE_SPEC) {
      if (spec.off === undefined) continue;
      const got = MEASURE[t.measure](t.probe, { ...v0, [spec.k]: spec.off });
      if (got === null) continue;
      const d = Math.abs(got - base)/Math.max(1e-9, base);
      if (d > 0.005) infl.push([spec.k, d]);
    }
    infl.sort((a, b) => b[1] - a[1]);
    rows.push({ id: t.id, knob: t.knob, top: infl[0] ? infl[0][0] : "(nothing)",
                clean: infl.length === 1 && infl[0][0] === t.knob,
                infl: infl.slice(0, 4) });
  }
  return rows;
}

// ---------------------------------------------------------------- main
if (require.main === module) {
  const args = process.argv.slice(2);
  const base = { ...P.defaultVoice(), ...P.VOICES.john.v };
  const KEYS = ["vlen", "coda", "fnl", "poly", "stopVc", "wkdur", "drawl", "glide", "gcap"];

  const before = score(base);
  const show = (label, s) => {
    console.log(`\n${label}   total error ${s.total.toFixed(2)}\n`);
    for (const r of s.rows) {
      const flag = r.err === null ? "  ?" : Math.abs(r.err) <= 1 ? "  ok" : "  OFF";
      console.log(`  ${r.id.padEnd(22)} want ${r.target.toFixed(2)} ±${r.tol.toFixed(2)}` +
                  `   got ${r.got === null ? "  —  " : r.got.toFixed(2)}${flag}`);
    }
  };
  show("as it stands", before);

  if (args.includes("--isolation")) {
    console.log("\nwhich knobs each measure actually responds to:\n");
    for (const r of isolation(base))
      console.log(`  ${r.id.padEnd(22)} should be ${r.knob.padEnd(8)}` +
                  ` ${r.clean ? "ok  " : "MIXED"}  ${r.infl.map(([k, d]) => k+" "+(100*d).toFixed(0)+"%").join("  ")}`);
    console.log("\n  A measure that responds to more than its own knob cannot be fitted against:");
    console.log("  the search will reach the number through whichever parameter is cheapest,");
    console.log("  which is how the first version of this drove `coda` to zero and called it");
    console.log("  an improvement.\n");
    process.exit(0);
  }
  if (args.includes("--show")) process.exit(0);
  if (!args.includes("--force")) {
    console.log("\n  Not fitting. Run --isolation first: every measure here still responds to");
    console.log("  more than its own knob, so a fit would tune the wrong parameters. --force");
    console.log("  runs it anyway.\n");
    process.exit(0);
  }

  const { v, best } = fit(base, KEYS);
  show("after fitting", score(v));

  console.log("\nwhat moved:\n");
  for (const k of KEYS) {
    if (Math.abs(v[k] - base[k]) < 1e-6) continue;
    console.log(`  ${k.padEnd(9)} ${base[k].toFixed(3)}  ->  ${v[k].toFixed(3)}`);
  }
  console.log(`\n  seed  ${P.encodeVoice(v)}`);
  console.log(`\n  error ${before.total.toFixed(2)} -> ${best.toFixed(2)}`);
  console.log("\n  This fits TIMING only, against ratios. It cannot hear anything, so it gets you");
  console.log("  to the literature and no further — the tournament is still what gets you from");
  console.log("  there to good.\n");
}

module.exports = { score, fit, MEASURE, segsOf };
