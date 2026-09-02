#!/usr/bin/env node
//
// A SPEAKER'S POSTURE TABLE, SOLVED AGAINST HIS OWN ANATOMY AND HIS OWN ACOUSTICS AT ONCE.
//
// The Edinburgh voice's vowels came from the coils through a map fitted on formants, and its
// consonants were the shared table. The same speaker's MRI then showed the shared consonants two
// centimetres too far back and two of the map's vowels with the wrong front-cavity gradient
// (RESEARCH.md, "The same-speaker MRI, read"). This solves every phone the MRI holds against BOTH
// things at once: the MRI's airway profile as a shape, and whatever the sound has to do to be that
// sound — a stop must seal where the speaker seals, a fricative must leave the channel the jet wants,
// /l/ and /r/ must ring where the sonorant targets say, and a vowel must reproduce the speaker's
// own measured formants. Neither alone was enough: the shape-only fits (research/fit/mri_fit.py)
// put closures in the right places and need not seal; the formant-only fits rang right and sat
// in the wrong place.
//
// THE TWO TRACTS ARE NOT THE SAME LENGTH AND DO NOT PUT THE SAME ANATOMY AT THE SAME FRACTION.
// The engine seals a /d/ at 0.80 of its tube and a /g/ at 0.568; this speaker's ridge is at 0.91 of
// the MRI's roof and his velar closure at 0.65. So the MRI profile is brought onto the engine's
// sections through those landmarks before anything is compared, and "the speaker's place" for a
// consonant means the engine section that anatomy maps to.
//
//   node lab/solve-speaker.js --profiles research/out/mri/profiles.csv --formants research/out/speaker_formants.csv
//                             [--voice mngu0] [--iters 1500] [--out postures.json]
//
// Prints a report per phone and the postures as a JS object ready for VOICES.<voice>.art.

const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, 'harness.js'));
const P = H.P;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true;
}
const VOICE = args.voice || 'mngu0';
const v = { ...P.defaultVoice(), ...(P.VOICES[VOICE].v || {}) };
const N = Math.round(v.sect);
const ITERS = +(args.iters || 1500);
const ARTS = ['jaw', 'bodyPos', 'bodyHi', 'tipPos', 'tipHi', 'lip'];

// engine fraction <-> MRI fraction, by anatomy (research/fit/stage1r.py has the same numbers)
const LM_ENGINE = [0, 0.568, 0.80, 1], LM_MRI = [0, 0.65, 0.91, 1];
const interp = (x, xs, ys) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
};
const toMRI = ue => interp(ue, LM_ENGINE, LM_MRI);
const toEngine = um => interp(um, LM_MRI, LM_ENGINE);

// ---- the MRI profiles, per prompt, brought onto the engine's sections ----
const PROMPT = { HIT: 'ɪ', PET: 'ɛ', HAT: 'æ', HOT: 'ɒ', HUT: 'ʌ', PUT: 'ʊ', HEAT: 'i', HOOT: 'u', HURT: 'ɝ', HART: 'ɑ',
                 OUGHT: 'ɔ', ABOUT: 'ə', FIN: 'f', THIN: 'θ', SIN: 's', SHIN: 'ʃ', MOCK: 'm', KNOCK: 'n', THING: 'ŋ',
                 RING: 'r', LONG: 'l', P: 'p', T: 't', K: 'k' };
const rows = fs.readFileSync(args.profiles, 'utf8').trim().split(/\r?\n/);
const head = rows[0].split(',');
const col = k => head.indexOf(k);
const prof = {};
for (const line of rows.slice(1)) {
  const f = line.split(',');
  const name = f[col('prompt')];
  if (!PROMPT[name]) continue;
  (prof[name] = prof[name] || []).push({ u: +f[col('u')], w: +f[col('width_mm')] });
}
const U_LO = 0.12, U_HI = 0.98;                     // the larynx end and the teeth are left out, as before
function mriOnSections(name) {
  const pts = prof[name].sort((a, b) => a.u - b.u);
  const out = new Array(N).fill(NaN);
  for (let i = 0; i < N; i++) {
    const um = toMRI(i / (N - 1));
    if (um < U_LO || um > U_HI) continue;
    let k = 1; while (k < pts.length - 1 && pts[k].u < um) k++;
    const a = pts[k - 1], b = pts[k];
    out[i] = a.w + (b.w - a.w) * (um - a.u) / Math.max(1e-9, b.u - a.u);
  }
  return out;
}

// ---- the speaker's formants, for the vowels ----
const FORM = {};
if (args.formants) {
  const fr = fs.readFileSync(args.formants, 'utf8').trim().split(/\r?\n/);
  const fh = fr[0].split(',');
  const CX = { i: 'i', I: 'ɪ', E: 'ɛ', a: 'æ', V: 'ʌ', A: 'ɑ', O: 'ɔ', U: 'ʊ', u: 'u', '@@': 'ɝ', '@': 'ə', Q: 'ɒ' };
  for (const line of fr.slice(1)) {
    const f = line.split(',');
    const sym = CX[f[fh.indexOf('phone')]];
    if (sym) FORM[sym] = { F1: +f[fh.indexOf('F1')], F2: +f[fh.indexOf('F2')], i1: +f[fh.indexOf('F1_iqr')], i2: +f[fh.indexOf('F2_iqr')] };
  }
}

// ---- what each class has to do, besides look right ----
const EPS = 0.08;
const STOPS = new Set(['p', 't', 'k']), NASALS = new Set(['m', 'n', 'ŋ']), FRIC = new Set(['f', 'θ', 's', 'ʃ']);
const SONOR = { l: { f: [360, 1300, 2700], tol: [120, 250, 300] }, r: { f: [310, 1060, 1600], tol: [120, 250, 200] } };
const JET = 0.19, UNDER = 0.033;                     // lab/check.js, "fricative channels survive being undershot"

function shapeLoss(d, w) {
  let sd = 0, sw = 0, c = 0;
  for (let i = 0; i < N; i++) if (Number.isFinite(w[i])) { sd += d[i]; sw += w[i]; c++; }
  let e = 0;
  for (let i = 0; i < N; i++) if (Number.isFinite(w[i])) {
    const a = Math.log(d[i] / (sd / c) + EPS), b = Math.log((w[i] + 0.3) / (sw / c + 0.3) + EPS);
    e += (a - b) * (a - b);
  }
  return e / c;
}
function narrowest(d) {
  let mn = 9, mi = 0;
  for (let i = 1; i < N - 1; i++) if (d[i] < mn) { mn = d[i]; mi = i; }
  return { mn, u: mi / (N - 1) };
}
function mriPlace(w) {
  let mn = 1e9, mi = 0;
  for (let i = 0; i < N; i++) if (Number.isFinite(w[i]) && w[i] < mn) { mn = w[i]; mi = i; }
  return mi / (N - 1);
}

const LAMBDA = 5;
function score(sym, A, w, place, withFormants) {
  const d = P.articulate(A, N);
  let e = LAMBDA * shapeLoss(d, w);
  const { mn, u } = narrowest(d);
  if (STOPS.has(sym) || NASALS.has(sym)) {
    if (mn > 0.0201) e += 40 * (mn - 0.02) + 4;                 // must seal
    if (Math.abs(u - place) > 0.05) e += 40 * (Math.abs(u - place) - 0.05) + 4;   // where the speaker seals
  } else if (FRIC.has(sym)) {
    const want = sym === 'ʃ' ? 0.30 : JET - UNDER;              // /ʃ/ is the wide one, by the gate's rule
    e += 30 * Math.pow(mn - want, 2) / 0.01;
    if (Math.abs(u - place) > 0.06) e += 40 * (Math.abs(u - place) - 0.06) + 4;
  } else if (SONOR[sym] && withFormants) {
    const f = H.formants(sym, { n: N, art: { [sym]: A } });
    if (!f || f.length < 3) e += 20;
    else for (let k = 0; k < 3; k++) e += Math.pow((f[k] - SONOR[sym].f[k]) / SONOR[sym].tol[k], 2) / 3;
  } else if (FORM[sym] && withFormants) {
    const f = H.formantsOfShape(d, { n: N });
    if (!f || f.length < 2) e += 20;
    else e += Math.pow((f[0] - FORM[sym].F1) / FORM[sym].i1, 2) + Math.pow((f[1] - FORM[sym].F2) / FORM[sym].i2, 2);
  }
  return e;
}

function rng(seed) { let t = seed; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r; return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
const unit = x => Math.max(0, Math.min(1, x));

function solve(sym, w, place, seedA) {
  const rnd = rng(20260902);
  // stage 1: shape and the cheap constraints, many candidates — formants are 30 ms each
  let best = null;
  const cands = [];
  for (let k = 0; k < ITERS; k++) cands.push(Object.fromEntries(ARTS.map(a => [a, rnd()])));
  if (seedA) cands.push({ ...seedA });
  for (const A of cands) { const e = score(sym, A, w, place, false); if (!best || e < best.e) best = { A, e }; }
  // stage 2: coordinate descent with everything on
  best = { A: best.A, e: score(sym, best.A, w, place, true) };
  let step = 0.12;
  for (let round = 0; round < 40 && step > 2e-3; round++) {
    let moved = false;
    for (const k of ARTS) for (const s of [step, -step]) {
      const A = { ...best.A, [k]: unit(best.A[k] + s) };
      if (A[k] === best.A[k]) continue;
      const e = score(sym, A, w, place, true);
      if (e < best.e - 1e-9) { best = { A, e }; moved = true; }
    }
    if (!moved) step *= 0.55;
  }
  return best;
}

const seedArt = { ...P.ART, ...(P.VOICES[VOICE].art || {}) };
const out = {}, report = [];
for (const [name, sym] of Object.entries(PROMPT)) {
  if (!prof[name]) continue;
  const w = mriOnSections(name);
  const place = mriPlace(w);
  const t0 = Date.now();
  const { A, e } = solve(sym, w, place, seedArt[sym]);
  const d = P.articulate(A, N);
  const { mn, u } = narrowest(d);
  const dn = d.slice(), r = (() => { // profile correlation over the measured sections
    const xs = [], ys = [];
    for (let i = 0; i < N; i++) if (Number.isFinite(w[i])) { xs.push(d[i]); ys.push(w[i]); }
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  })();
  let acoustic = '';
  if (SONOR[sym]) { const f = H.formants(sym, { n: N, art: { [sym]: A } }); acoustic = `F ${f.join('/')} (want ${SONOR[sym].f.join('/')})`; }
  else if (FORM[sym]) { const f = H.formantsOfShape(d, { n: N }); acoustic = `F ${f.slice(0, 2).join('/')} (speaker ${FORM[sym].F1}/${FORM[sym].F2})`; }
  else if (FRIC.has(sym)) acoustic = `channel ${mn.toFixed(3)}`;
  else acoustic = `seal ${mn.toFixed(3)}`;
  out[sym] = Object.fromEntries(ARTS.map(k => [k, +A[k].toFixed(3)]));
  report.push(`  /${sym}/ ${name.padEnd(6)} loss ${e.toFixed(3)}  r ${r.toFixed(2)}  narrowest at ${u.toFixed(2)} (speaker ${place.toFixed(2)})  ${acoustic}   ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.error(report[report.length - 1]);
}
// the voiced partners share their voiceless place; the rest stay shared
for (const [a, b] of [['b', 'p'], ['d', 't'], ['g', 'k'], ['z', 's'], ['v', 'f'], ['ð', 'θ'], ['ʒ', 'ʃ']]) if (out[b]) out[a] = { ...out[b] };

if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log('\n  // solved by lab/solve-speaker.js against the MRI profiles and the speaker\'s formants');
for (const [sym, A] of Object.entries(out)) console.log(`    '${sym}': { ${ARTS.map(k => `${k}: ${A[k].toFixed(3)}`).join(', ')} },`);
