#!/usr/bin/env node
/**
 * Turn a measured voice into a preset.
 *
 *   node lab/fit-preset.js <voice-fit.json> [name]
 *
 * Takes what voice-fit.py measured from a real recording and finds the model settings
 * that reproduce it: tract length fitted across the WHOLE vowel set (one parameter,
 * many constraints), then each vowel's articulation re-solved at that length, then the
 * source parameters derived from the voice-quality measures.
 *
 * The output is a seed — the same 34 characters the app uses — plus the per-vowel
 * articulations, so a person can become a preset.
 */
const fs = require("fs");
const path = require("path");
const H = require("./harness.js");
const { Tract } = require("./tract.js");

// which recorded word carries which vowel (the Peterson & Barney /hVd/ set)
const WORD_VOWEL = {
  heed: "i", hid: "ɪ", head: "ɛ", had: "æ", hod: "ɑ",
  hawed: "ɔ", hood: "ʊ", "who'd": "u", whod: "u", hud: "ʌ", heard: "ɝ",
  uh: "ə", schwa: "ə", sustained: "ə", neutral: "ə",
};

/** Formants of an area function. LPC on the impulse response — a brute-force DFT inside
 *  a search loop is about a hundred times slower, and this project has fallen for that
 *  once already. */
function formantsOf(diam, n) {
  const t = new Tract(n);
  t.diam.set(diam);
  t.calcReflections();
  const L = 2048, F = 4;
  const ir = new Float64Array(L);
  ir[0] = t.sample(1);
  for (let i = 1; i < L; i++) ir[i] = t.sample(0);
  const M = Math.floor(L / F), x = new Float64Array(M);
  for (let i = 0; i < M; i++) { let a = 0; for (let k = 0; k < F; k++) a += ir[i*F+k]; x[i] = a/F; }
  const sr = 44100 / F, order = 12;
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) { let a = 0; for (let i = 0; i < M-k; i++) a += x[i]*x[i+k]; r[k] = a; }
  if (!(r[0] > 0)) return [];
  const a = new Float64Array(order+1), tmp = new Float64Array(order+1);
  let E = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc -= a[j]*r[i-j];
    const k = acc / E;
    tmp.set(a); tmp[i] = k;
    for (let j = 1; j < i; j++) tmp[j] = a[j] - k*a[i-j];
    a.set(tmp); E *= (1 - k*k);
    if (!(E > 0)) break;
  }
  const pk = []; let pm2 = 0, pm1 = 0;
  for (let f = 150; f <= 3600; f += 12) {
    const w = 2*Math.PI*f/sr;
    let re = 1, im = 0;
    for (let j = 1; j <= order; j++) { re -= a[j]*Math.cos(w*j); im += a[j]*Math.sin(w*j); }
    const mag = 1/Math.hypot(re, im);
    if (pm1 > pm2 && pm1 > mag) pk.push(f - 12);
    pm2 = pm1; pm1 = mag;
  }
  return pk.slice(0, 3);
}

/** Search articulator space for the posture that best hits a target F1/F2 at length n. */
function solveVowel(f1, f2, n, iters = 900, seed = 12345) {
  let best = null, bad = 1e9, t = seed;
  const rnd = () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
  for (let k = 0; k < iters; k++) {
    const A = { jaw: rnd(), bodyPos: 0.15 + rnd() * 0.70, bodyHi: rnd() * 0.95,
                tipPos: 0.84, tipHi: rnd() * 0.12, lip: 0.06 + rnd() * 0.94 };
    const f = formantsOf(H.P.articulate(A, n), n);
    if (f.length < 2) continue;
    const e = Math.pow((f[0] - f1) / f1, 2) + Math.pow((f[1] - f2) / f2, 2);
    if (e < bad) { bad = e; best = { A, f }; }
  }
  return best ? { ...best, err: Math.sqrt(bad) * 100 } : null;
}

function main() {
  const src = process.argv[2] || "/home/claude/voice-fit.json";
  const name = process.argv[3] || "measured";
  const rows = JSON.parse(fs.readFileSync(src, "utf8"));

  // ---- gather the measured vowels ----
  const measured = {};
  for (const r of rows) {
    const key = String(r.label || "").toLowerCase().replace(/[^a-z']/g, "");
    const v = WORD_VOWEL[key];
    if (v && r.F && r.F.length >= 2) measured[v] = [Math.round(r.F[0]), Math.round(r.F[1])];
  }
  const vowels = Object.keys(measured);
  if (vowels.length < 3) {
    console.log("Need at least three labelled vowels. Label the segments with --labels when"
              + " running voice-fit.py, e.g. --labels uh,heed,hid,head,...");
    process.exit(1);
  }

  console.log(`\nmeasured vowels: ${vowels.map(v => `/${v}/ ${measured[v][0]}/${measured[v][1]}`).join("   ")}\n`);

  // ---- tract length, from F3 ----
  // F1 and F2 are dominated by where the tongue is; fitting length to them gives a flat,
  // meaningless minimum and the search just stretches the tube to cover for the
  // articulation model's limits. F3 barely moves with articulation — it tracks the TUBE.
  const f3s = rows.map(r => (r.F && r.F.length >= 3 && r.F[2] > 1800 && r.F[2] < 4000)
                            ? r.F[2] : null).filter(Boolean);
  let bestN;
  if (f3s.length >= 4) {
    const medF3 = [...f3s].sort((a,b)=>a-b)[Math.floor(f3s.length/2)];
    const cm = 5 * 35000 / (4 * medF3);
    const n = Math.max(20, Math.min(60, Math.round(cm/100 / (350/(44100*2)))));
    bestN = { n, cm: n * 350 / (44100*2) * 100, err: 0, from: `F3 median ${medF3.toFixed(0)} Hz` };
    console.log(`tract length from F3 (5c/4L, ${f3s.length} vowels):`);
    console.log(`  median F3 ${medF3.toFixed(0)} Hz  ->  ${cm.toFixed(1)} cm  ->  ${bestN.n} sections\n`);
  } else {
    bestN = { n: 44, cm: 17.5, err: 0, from: "default — too few F3 measurements" };
    console.log("not enough F3 measurements; defaulting to 44 sections\n");
  }
  // report how well the vowels fit at that length, and nearby, so the choice is visible
  console.log("  how the vowels fit at that length and around it:");
  for (const n of [bestN.n - 6, bestN.n - 3, bestN.n, bestN.n + 3, bestN.n + 6]) {
    if (n < 20) continue;
    let err = 0, cnt = 0;
    for (const v of vowels) {
      const s = solveVowel(measured[v][0], measured[v][1], n, 260, 7 + n);
      if (s) { err += s.err; cnt++; }
    }
    console.log(`    ${String(n).padStart(2)} sections (${(n*350/(44100*2)*100).toFixed(1)} cm)`
              + `  mean ${(err/Math.max(1,cnt)).toFixed(1)}%${n===bestN.n ? "   <- chosen from F3" : ""}`);
  }
  console.log();

  // ---- re-solve each vowel properly at that length ----
  console.log("articulations at that length:\n");
  const art = {};
  for (const v of vowels) {
    const s = solveVowel(measured[v][0], measured[v][1], bestN.n, 1600, 991);
    if (!s) continue;
    art[v] = Object.fromEntries(Object.entries(s.A).map(([k, x]) => [k, +x.toFixed(3)]));
    console.log(`  /${v}/  target ${measured[v][0]}/${measured[v][1]}  ->  ${s.f[0]}/${s.f[1]}`
              + `  (${s.err.toFixed(1)}%)   jaw ${s.A.jaw.toFixed(2)} body `
              + `${s.A.bodyPos.toFixed(2)}@${s.A.bodyHi.toFixed(2)} lip ${s.A.lip.toFixed(2)}`);
  }

  // ---- source parameters from the voice-quality measures ----
  const f0s = rows.map(r => r.f0).filter(x => x > 40);
  // A fricative has no harmonics, so H1-H2 is meaningless there. Vowels only.
  const VOWEL_WORDS = new Set(Object.keys(WORD_VOWEL));
  const h1h2 = rows.filter(r => VOWEL_WORDS.has(String(r.label||"").toLowerCase()))
                   .map(r => r.h1h2).filter(x => typeof x === "number");
  const durs = rows.filter(r => r.label).map(r => r.b - r.a);
  const med = a => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;

  const f0med = med(f0s), h = med(h1h2);
  const rd = h === null ? 1.0 : Math.max(0.35, Math.min(2.4, 0.55 + 0.13 * h));
  const per = durs.length ? Math.max(0.10, Math.min(0.8, med(durs) / 4)) : 0.17;

  // ---- prosody, from durations ----
  // Everything above describes what the voice IS. These describe how the person TALKS, and
  // until now every one of them was a published average from 1960 measured on somebody else.
  //
  // Both are fitted from WORD durations, which is sound for exactly these two cases and for no
  // others. In /hVd/ the onset and the coda are constant across the set, so a word-duration
  // difference IS a vowel-duration difference — that is the experiment Peterson & Lehiste ran
  // to produce the table `vlen` scales. In cap/captain/captaincy what varies is the syllable
  // count. Anything needing a vowel measured separately from its own coda is not fittable this
  // way and is deliberately not attempted here.
  const durOf = w => { const r = rows.find(x => String(x.label||"").toLowerCase() === w);
                       return r ? r.b - r.a : null; };

  // vlen — the /hVd/ set is ten vowels between a constant /h/ and a constant /d/, so a
  // word-duration difference across it IS a vowel-duration difference. That is the experiment
  // Peterson & Lehiste ran to produce the table `vlen` scales.
  //
  //   word_i = C + V0 * (1 + (t_i - 1) * vlen)          t_i = the table's value for that vowel
  //
  // Regressing word_i on t_i gives slope = V0*vlen. C is the /h/ plus /d/ plus the transitions,
  // which the model can supply and a recording cannot; V0 then falls out of the mean. Note the
  // model is used ONLY for that constant — the scaling comes entirely from the measurement,
  // which is the point. Do not take C from buildWord's word length: buildWord preserves total
  // duration by construction and a speaker does not, so that route reports a compressed answer.
  let vlen = null, vlenN = 0, vlenR = null;
  {
    const pairs = [];
    for (const [w, vow] of Object.entries(WORD_VOWEL)) {
      if (vow === "ə") continue;                       // the sustained item is not a /hVd/ word
      const t = H.P.VDUR[vow]; if (t === undefined) continue;
      const d = durOf(w); if (d === null) continue;
      pairs.push([t, d]);
    }
    vlenN = pairs.length;
    if (pairs.length >= 5) {
      const mx = pairs.reduce((a,p)=>a+p[0],0)/pairs.length,
            my = pairs.reduce((a,p)=>a+p[1],0)/pairs.length;
      let sxy = 0, sxx = 0, syy = 0;
      for (const [x, y] of pairs) { sxy += (x-mx)*(y-my); sxx += (x-mx)**2; syy += (y-my)**2; }
      if (sxx > 1e-12 && syy > 1e-12) {
        vlenR = sxy/Math.sqrt(sxx*syy);
        const slope = sxy/sxx;                          // = V0 * vlen
        // C: everything in the word that is not the vowel, at this speaker's rate.
        const W = H.P.buildWord(["h","ɑ","d"], { D: 4*per, n: bestN.n, stopHold: 0.075 });
        const vowSeg = W.seg.find(x => x.sym === "ɑ");
        const C = (W.end - 0.22) - (vowSeg.b - vowSeg.a);
        const V0 = my - C;
        if (V0 > 0.02) vlen = Math.max(0, Math.min(2, slope / V0));
      }
    }
  }

  // poly — three words, one, two and three syllables, same rate. Per-syllable duration should
  // fall as 1/(1 + poly*(n-1)); solve for poly by least squares over whatever is present.
  let poly = null;
  {
    const set = [["cap",1],["captain",2],["captaincy",3],["stick",1],["sticky",2],["stickiness",3]];
    const got = set.map(([w,k]) => [k, durOf(w)]).filter(x => x[1] !== null);
    const base = got.filter(x => x[0] === 1).map(x => x[1]);
    if (base.length && got.length >= 3) {
      const b = base.reduce((a,c)=>a+c,0)/base.length;
      let best = null;
      for (let p = 0; p <= 0.30001; p += 0.005) {
        let e = 0;
        for (const [k, d] of got) { const want = k*b/(1 + p*(k-1)); e += (d-want)**2; }
        if (best === null || e < best[1]) best = [p, e];
      }
      poly = +best[0].toFixed(3);
    }
  }

  const v = { ...H.P.defaultVoice(),
    sect: bestN.n,
    f0a: Math.round(f0med * 0.92), f0b: Math.round(f0med * 1.08), f0c: Math.round(f0med * 0.82),
    rd: +rd.toFixed(2), per: +per.toFixed(2) };
  if (vlen !== null) v.vlen = +vlen.toFixed(2);
  if (poly !== null) v.poly = poly;

  console.log("\nsource, from the measures:\n");
  console.log(`  F0 median ${f0med ? f0med.toFixed(0) : "—"} Hz  ->  arc ${v.f0a}/${v.f0b}/${v.f0c}`);
  console.log(`  H1-H2 median ${h === null ? "—" : h.toFixed(1) + " dB"}  ->  Rd ${v.rd}`);
  console.log(`  median word ${durs.length ? med(durs).toFixed(2) + " s" : "—"}  ->  per ${v.per} s/sound`);
  console.log(vlen === null
    ? `  vowel length      —  (needs 5+ of the /hVd/ set; found ${vlenN})`
    : `  /hVd/ durations vs the model, r=${vlenR.toFixed(2)} over ${vlenN} vowels  ->  vlen ${v.vlen}`);
  console.log(poly === null
    ? "  polysyllabic      —  (needs cap/captain/captaincy or stick/sticky/stickiness)"
    : `  cap/captain/captaincy  ->  poly ${v.poly}`);
  console.log("\n  not fitted from word durations, and not guessed: coda, stopVc, wkdur,");
  console.log("  wklev, fnl, acc. Each needs a vowel measured separately from its own coda,");
  console.log("  or one syllable from the next. Record them anyway; the analysis can follow.");

  // ---- the seed ----
  const spec = H.P.VOICE_SPEC;
  const seed = spec.map(p => {
    const t = Math.max(0, Math.min(1295, Math.round((v[p.k] - p.lo) / (p.hi - p.lo) * 1295)));
    return t.toString(36).padStart(2, "0");
  }).join("");

  console.log(`\n  seed: ${seed}\n`);
  const out = { name, sections: bestN.n, cm: +bestN.cm.toFixed(1), voice: v, art, seed,
                fitError: +bestN.err.toFixed(1) };
  fs.writeFileSync(`/home/claude/preset-${name}.json`, JSON.stringify(out, null, 1));
  console.log(`written to /home/claude/preset-${name}.json`);
}

main();
