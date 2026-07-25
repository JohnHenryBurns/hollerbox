#!/usr/bin/env node
/**
 * Fit consonant postures to their targets.
 *
 *   node lab/solve-consonants.js            report only, change nothing
 *   node lab/solve-consonants.js --write    write the postures it found into engine/phonemes.js
 *
 * STAGE A: the UNBRANCHED sonorants only — /r/, /w/, /j/.
 *
 * The vowels have targets and a solver and score 10/10; the consonants had neither, which is why
 * a sweep came back 14/20 and why nothing had noticed /n/ and /l/ share an F2 to within ten
 * hertz. `lab/consonant-targets.json` supplied the first half. This is the second.
 *
 * WHY ONLY THREE OF THE SEVEN. /r/, /w/ and /j/ are plain tubes: their formants come from the
 * shape and nothing else, so this is exactly the problem `solveVowel` already solves and the
 * same measurement can score it.
 *
 * /l/ has a side pocket and /m n ŋ/ have the velum open, and there the measurement itself is
 * not yet right: `formants()` opens the LATERAL branch and there is no nasal one, so a nasal is
 * currently measured as a tube sealed part-way along with no outlet at all. That is a closed
 * cavity, not a murmur. Fitting postures against a measurement of the wrong system would produce
 * confident numbers for the wrong thing, so stage B starts by fixing the measurement rather than
 * by solving anything.
 *
 * THREE PARAMETERS THE VOWEL SOLVER PINS, THIS ONE DOES NOT. `solveVowel` holds tipPos at 0.84
 * and keeps tipHi under 0.12, because a vowel is a body-and-jaw shape and a raised tip would be
 * a different sound. Every consonant here is defined by where the tip or the lips are, so those
 * have to be free — which makes the space bigger and the search correspondingly longer.
 */
const fs = require("fs");
const path = require("path");
const H = require(path.join(__dirname, "harness.js"));
const P = H.P;

const T = JSON.parse(fs.readFileSync(path.join(__dirname, "consonant-targets.json"), "utf8"));
const STAGE_A = ["r", "w", "j"];                       // no branch, no velum
const N = 44;                                          // the reference male length

/** Deterministic, so two runs of this produce the same postures. */
function rng(seed) {
  let t = seed;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

/** Draw a posture inside the sound's own anatomical bounds.
 *
 *  Three formants underdetermine a tongue. Unbounded, the solver hit every target and got there
 *  wrongly — /w/ with a flat body and a raised tip, which is the opposite of a labio-velar, and
 *  /j/ with the tip almost touching instead of a high front body. Both scored inside tolerance,
 *  and both would have dragged the wrong articulator through every transition they take part
 *  in, which since Phase 9 is audible.
 *
 *  The bounds are not fitted. They are what the sound is. */
const DEFAULT_RANGE = { jaw:[0,1], bodyPos:[0.10,0.95], bodyHi:[0,1],
                        tipPos:[0.55,1], tipHi:[0,1], lip:[0.05,1] };
function pick(tgt, rnd) {
  const A = {};
  for (const k of Object.keys(DEFAULT_RANGE)) {
    const b = (tgt.bounds && tgt.bounds[k]) || DEFAULT_RANGE[k];
    A[k] = b[0] + rnd()*(b[1] - b[0]);
  }
  return A;
}
function clampTo(A, tgt) {
  const out = {};
  for (const k of Object.keys(DEFAULT_RANGE)) {
    const b = (tgt.bounds && tgt.bounds[k]) || DEFAULT_RANGE[k];
    out[k] = Math.max(b[0], Math.min(b[1], A[k]));
  }
  return out;
}

/** Score a posture against a target, weighted by that target's own tolerance. A formant with a
 *  tight band matters more than one with a loose one — which is how /r/'s F3 comes to dominate
 *  its own fit, as it should, since F3 is the entire distinction from /l/. */
function score(A, tgt) {
  const f = H.formants(tgt.sym, { n: N, art: { [tgt.sym]: A } });
  if (!f || f.length < 3) return { e: 1e9, f: null };
  let e = 0;
  for (let k = 0; k < 3; k++) e += Math.pow((f[k] - tgt.f[k]) / tgt.tol[k], 2);
  return { e, f };
}

/** Random restarts, then a local walk from the best. The space is small and the measurement is
 *  cheap; this does not need to be clever. */
function solve(tgt, iters = 1400, seed = 20260725) {
  const rnd = rng(seed);
  let best = null;
  for (let k = 0; k < iters; k++) {
    const A = pick(tgt, rnd);
    const s = score(A, tgt);
    if (!best || s.e < best.e) best = { A, ...s };
  }
  // local refinement, shrinking steps
  let step = 0.12;
  for (let round = 0; round < 40 && step > 1e-3; round++) {
    let moved = false;
    for (const key of ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]) {
      for (const d of [step, -step]) {
        const A = clampTo({ ...best.A, [key]: best.A[key] + d }, tgt);
        if (A[key] === best.A[key]) continue;
        const s = score(A, tgt);
        if (s.e < best.e) { best = { A, ...s }; moved = true; }
      }
    }
    if (!moved) step *= 0.55;
  }
  return best;
}

const round3 = A => Object.fromEntries(Object.entries(A).map(([k, v]) => [k, +v.toFixed(3)]));

function main() {
  const write = process.argv.includes("--write");
  console.log("\n  stage A — the unbranched sonorants, at n=" + N + "\n");
  console.log("  sym   F1    F2    F3        target            err   posture");
  const out = {};
  for (const sym of STAGE_A) {
    const tgt = T.sonorants.find(x => x.sym === sym);
    if (!tgt) continue;
    const before = H.formants(sym, { n: N });
    const got = solve(tgt);
    const inTol = got.f.every((v, k) => Math.abs(v - tgt.f[k]) <= tgt.tol[k]);
    out[sym] = round3(got.A);
    console.log("  /" + sym + "/  was " + before.slice(0,3).map(x => String(x).padStart(5)).join(" "));
    console.log("       now " + got.f.slice(0,3).map(x => String(Math.round(x)).padStart(5)).join(" ") +
                "   want " + tgt.f.map(x => String(x).padStart(5)).join(" ") +
                "   " + (inTol ? "ok " : "OFF") + "  " + Math.sqrt(got.e).toFixed(2));
    console.log("       " + JSON.stringify(round3(got.A)));
  }
  if (!write) {
    console.log("\n  --write to put these into engine/phonemes.js\n");
    return;
  }
  const p = path.join(__dirname, "..", "engine", "phonemes.js");
  let src = fs.readFileSync(p, "utf8");
  for (const [sym, A] of Object.entries(out)) {
    const re = new RegExp('(\\s"' + sym + '": \\{)[^}]*(\\})');
    const body = "\n" + Object.entries(A).map(([k, v]) => `  "${k}": ${v}`).join(",\n") + "\n ";
    if (!re.test(src)) { console.log("  could not place /" + sym + "/ — left alone"); continue; }
    src = src.replace(re, "$1" + body + "$2");
  }
  fs.writeFileSync(p, src);
  console.log("\n  written. re-run the gate.\n");
}

if (require.main === module) main();
module.exports = { solve, score, STAGE_A };
