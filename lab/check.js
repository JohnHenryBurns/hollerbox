// THE GATE. One command, one verdict.
//   node lab/check.js        (exit 0 = shippable)
//
// Every band here exists because something broke that way. The comments say which.
const H = require("./harness.js");

// Which voices the per-voice checks exercise. Ten presets is slow and most of them are
// nobody's target; john and man are the two being tuned. HOLLER_ALL=1 runs the full set
// before a release, when a preset silently breaking actually matters.
const VOICES_UNDER_TEST = process.env.HOLLER_ALL
  ? null
  : (process.env.HOLLER_VOICES || "john,man").split(",").map(s => s.trim());

// Checks REGISTER here; they do not run on registration. Running them at registration time
// meant the gate was all-or-nothing: no way to run the three stop checks while working on
// stops, no output until all twenty-two had finished, and no way to spread them over cores.
// A check body is unchanged by this — it is still a function returning {ok, note}.
// TWO TIERS, because two different things were wearing the same coat.
//
// A GATE check asserts something that must be TRUE: the output is finite, nothing sounds after
// a word ends, the tube obeys c/4L, the stress array is the same length as the phone array.
// These do not need recalibrating when the engine legitimately changes, because they were never
// describing this build in particular.
//
// A REPORT check MEASURES: /s/ sits at 4650 Hz, /ʃ/ carries 54% of its energy above 3 kHz,
// harmonic-to-noise is 23 dB. These are worth knowing and worth watching. They are not worth
// blocking on, because every one of them has a band that is really a snapshot of a particular
// calibration — so they go red when something is DIFFERENT, not when something is WRONG, and
// two dozen commits of re-tuning bands is the predictable result.
//
// Gate runs by default and blocks. Report runs on --report and never blocks.
const REG = [];
function check(name, fn)  { REG.push({ name, fn, tier: "gate" }); }
function report(name, fn) { REG.push({ name, fn, tier: "report" }); }

// ── the tube is still a tube ───────────────────────────────────────────────
check("uniform tube resonates at c/4L", () => {
  const { Tract, SR } = require("./tract.js");
  const t = new Tract(); t.diam.fill(1.6); t.calcReflections();
  const L = 16384, ir = new Float64Array(L);
  ir[0] = t.sample(1); for (let i = 1; i < L; i++) ir[i] = t.sample(0);
  const pk = []; let a = 0, b = 0;
  for (let f = 200; f <= 3000; f += 5) {
    let re = 0, im = 0;
    for (let i = 0; i < L; i++) {
      const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/L), q = 2*Math.PI*f*i/SR;
      re += ir[i]*w*Math.cos(q); im -= ir[i]*w*Math.sin(q);
    }
    const m = Math.hypot(re, im);
    if (b > a && b > m) pk.push(f - 5);
    a = b; b = m;
  }
  const err = Math.abs(pk[0]-500)/500;
  return { ok: err < 0.05 && Math.abs(pk[1]-1500)/1500 < 0.05,
           note: pk.slice(0,3).join(" / ") + " Hz (want 500/1500/2500)" };
});

// ── vowels land where the measurements say ─────────────────────────────────
// Peterson & Barney (1952), adult-male means, JASA 24(2):175-184. These ten are theirs and
// match the published table exactly.
const VOWEL_TARGETS = {
  i:[270,2290], "ɪ":[390,1990], "ɛ":[530,1840], "æ":[660,1720], "ʌ":[640,1190],
  "ɑ":[730,1090], "ɔ":[570,840], "ʊ":[440,1020], u:[300,870], "ɝ":[490,1350],
  // NOT Peterson & Barney. They measured ten vowels — heed hid head had hod hawed hood who'd
  // hud heard — and neither of these is among them. Conventional adult-male values, kept
  // because the model should hit them, but the check's name overstated its authority while
  // they sat in the same table unmarked.
  "ə":[500,1500], o:[490,910],
};
const PB_VOWELS = new Set(["i","ɪ","ɛ","æ","ʌ","ɑ","ɔ","ʊ","u","ɝ"]);
check("vowels match Peterson & Barney", () => {
  // Reported split by provenance. Twelve targets are checked but only ten are Peterson &
  // Barney's; saying "12/12 against P&B" claimed an authority two of them do not have.
  let good = 0, pbGood = 0, pbN = 0, worst = "", worstErr = 0;
  for (const [sym, [t1, t2]] of Object.entries(VOWEL_TARGETS)) {
    const f = H.formants(sym);
    if (f.length < 2) continue;
    const e = Math.sqrt(((f[0]-t1)/t1)**2 + ((f[1]-t2)/t2)**2)*100;
    const isPB = PB_VOWELS.has(sym);
    if (isPB) pbN++;
    if (e < 12) { good++; if (isPB) pbGood++; }
    if (e > worstErr) { worstErr = e; worst = sym; }
  }
  const n = Object.keys(VOWEL_TARGETS).length;
  return { ok: good >= n - 2,
           note: `${pbGood}/${pbN} vs P&B, ${good}/${n} overall within 12% (worst /${worst}/ ${worstErr.toFixed(0)}%)` };
});

// ── consonants close where they should ─────────────────────────────────────
check("stops seal at their place of articulation", () => {
  const want = { b:[0.90,1.0], d:[0.75,0.88], g:[0.42,0.60], p:[0.90,1.0], t:[0.75,0.88], k:[0.42,0.60] };
  const bad = [];
  for (const [sym, [lo, hi]] of Object.entries(want)) {
    const d = H.P.articulate(H.P.ART[sym], 44);
    let mn = 9, at = 0;
    for (let i = 1; i < 43; i++) if (d[i] < mn) { mn = d[i]; at = i/43; }
    if (mn > 0.25 || at < lo || at > hi) bad.push(`${sym}@${at.toFixed(2)}/${mn.toFixed(2)}`);
  }
  return { ok: bad.length === 0, note: bad.length ? bad.join(" ") : "lips, ridge and velum all sealed" };
});

check("the lateral is not a /w/", () => {
  const f = H.formants("l");
  // /w/ sits near 300/750. A lateral needs F2 well clear of that, and a high F3.
  // /l/ vs /r/ is F3: a lateral is high (2600-3000), a rhotic is low (1600-2000). The side
  // pocket once dragged a pole to 2050 and put its zero on F3, which is literally an /r/.
  return { ok: f[1] > 1000 && f[2] > 2450,
           note: f.join(" / ") + " Hz (a /w/ is ~300/750/2300; an /r/ has F3 near 1800)" };
});

check("nasals produce a murmur", () => {
  const bad = [];
  for (const sym of ["m","n","ŋ"]) {
    const x = H.sustain(sym, { seconds: 1.0 });
    const r = H.rms(x, 0.5, 0.95);
    const sp = H.spectrum(x, { lo: 150, hi: 2000, step: 50 });
    const p = H.peakOf(sp);
    if (r < 0.004 || p.f > 600) bad.push(`${sym} rms${r.toFixed(4)} peak${p.f}`);
  }
  return { ok: bad.length === 0, note: bad.length ? bad.join("  ") : "all three audible with a low first resonance" };
});

// ── sibilants: shape, not hiss ─────────────────────────────────────────────
report("sibilants are shaped at every tract length", () => {
  // A short tract puts /s/ higher — correctly. Testing only 44 sections missed whether the
  // shorter voices (woman, child, helium) still produce a sibilant rather than a hiss.
  // Frication is intermittent by design — a real jet sheds eddies — so a single render's
  // band share swings by tens of points. Measured once, this check passes or fails at random,
  // which it did. Average, and use enough window to see several eddies.
  const bad = [];
  for (const n of [19, 31, 37, 44, 48]) {   // every length a shipping voice uses
    let pk = 0, low = 0;
    for (let i = 0; i < 3; i++) {
      const sp = H.spectrum(H.sustain("s", { n, seconds: 1.8 }),
                            { lo: 500, hi: 11000, step: 250, hops: 22 });
      pk += H.peakOf(sp).f; low += H.bandShare(sp, 500, 2500);
    }
    pk /= 3; low /= 3;
    if (pk < 3200 || low > 20) bad.push(`${n}:${pk.toFixed(0)}Hz/${low.toFixed(0)}%`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? "weak at " + bad.join(" ") : "sibilant from 19 to 52 sections" };
});

report("sibilant shape at the default length", () => {
  // Bands from a real recording, not from assumption. Measured on the reference speaker:
  // /s/ peaks at 4625 Hz with 96% of its energy above 3 kHz; /ʃ/ peaks at 2188 with 57%.
  // They are DIFFERENT sounds and an earlier version of this check demanded both be
  // sibilant-bright, which is why fitting /ʃ/ to the recording made the gate fail.
  const notes = [];
  let ok = true;
  // Bands from a fit against a real recording, scaled for the tract-length difference
  // between that speaker and the default. /s/ and /ʃ/ are genuinely different sounds and get
  // different bands — an earlier version demanded both be sibilant-bright, which is why
  // fitting /ʃ/ honestly made the gate fail.
  for (const [sym, lo, hi, minHigh] of [["s", 3500, 6000, 80], ["ʃ", 1000, 4000, 35]]) {
    let pk = 0, high = 0;
    const K = 4;                                  // /ʃ/ swings 42-77% between single renders
    for (let i = 0; i < K; i++) {
      const sp = H.spectrum(H.sustain(sym, { seconds: 1.8 }),
                            { lo: 400, hi: 9000, step: 200, hops: 22 });
      pk += H.peakOf(sp).f; high += H.bandShare(sp, 3000, 9000);
    }
    pk /= K; high /= K;
    if (pk < lo || pk > hi || high < minHigh) ok = false;
    notes.push(`${sym} ${pk.toFixed(0)}Hz ${high.toFixed(0)}% high`);
  }
  return { ok, note: notes.join("  ") };
});

report("frication breathes rather than sitting flat", () => {
  // Stationary white noise IS electronic static, by definition. Real turbulence is
  // intermittent — eddies form and collapse — and that fluctuation is what the ear reads
  // as breath. The flat version measured 12%.
  const notes = [];
  let ok = true;
  for (const sym of ["s", "ʃ"]) {
    const x = H.sustain(sym, { seconds: 1.4 });
    const hop = Math.floor(H.SR*0.004), env = [];
    for (let i = Math.floor(x.length*0.4); i < x.length - hop; i += hop) {
      let s2 = 0; for (let k = 0; k < hop; k++) s2 += x[i+k]*x[i+k];
      env.push(Math.sqrt(s2/hop));
    }
    const m = env.reduce((a,b)=>a+b,0)/env.length;
    let dev = 0; for (const e of env) dev += Math.abs(e-m);
    const flutter = dev/env.length/m*100;
    if (flutter < 18) ok = false;
    notes.push(`${sym} ${flutter.toFixed(0)}%`);
  }
  return { ok, note: notes.join("  ") + " envelope flutter" };
});

check("every fricative actually sounds", () => {
  // /f/ once sat at 7% of a vowel because its constriction was far from where the jet blows,
  // and /h/ was SILENT because it is glottal aspiration, not a constriction fricative — with
  // voicing off it had no path to make any noise at all.
  // These are NOISE sources — a single render varies by a third run to run. Measuring once
  // and comparing to a fixed threshold gives a check that passes or fails at random, which
  // is worse than one that simply fails. Average.
  const mean = (sym, k = 3) => {
    let a = 0;
    for (let i = 0; i < k; i++) a += H.rms(H.sustain(sym, { seconds: 1.0 }), 0.5, 0.95);
    return a / k;
  };
  const vowel = mean("ɑ");
  const weak = [], notes = [];
  for (const sym of ["s", "ʃ", "z", "ʒ", "f", "v", "θ", "ð", "h"]) {
    const pct = mean(sym) / vowel * 100;
    if (pct < 22) weak.push(`${sym} ${pct.toFixed(0)}%`);
    notes.push(`${sym} ${pct.toFixed(0)}`);
  }
  return { ok: weak.length === 0,
           note: weak.length ? "too quiet: " + weak.join(" ") : notes.join(" ") + " (% of a vowel)" };
});

check("nothing the speller produces gets silently dropped", () => {
  // "name" spelled correctly to n eɪ m and then came out as "n m", because the app filtered
  // the result against ART — where diphthongs do not live. A sound that vanishes between
  // the speller and the chain is invisible unless something checks for it.
  const known = new Set([...Object.keys(H.P.ART), ...Object.keys(H.P.DIPH), " "]);
  // The speller is a file. This used to rebuild it out of index.html with six regular
  // expressions and a fake localStorage — one of which required `const PAUSE=` to be
  // immediately followed by `function g2pWord`, so reordering two unrelated declarations in
  // the page would have broken this check while looking like a speller regression.
  // Required with no storage, so it tests the SHIPPED dictionary rather than a browser's.
  const S = require(__dirname + "/../engine/spelling.js");
  const g2p = S.g2p;
  const words = ["name","high","how","boy","bay","boat","thin","then","chin","gin","measure",
                 "goal","bulldog","maximus","solana","rachel","orion","jupiter","atlas",
                 "this","mother","wed","you","zoo","hey sexy lady"];
  const bad = [];
  for (const w of words) {
    const ph = g2p(w).ph;
    const lost = ph.filter(x => !known.has(x));
    if (lost.length) bad.push(`${w}:${[...new Set(lost)].join("")}`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? "would be dropped — " + bad.join(" ")
                            : `${words.length} words, nothing unspeakable` };
});

// ── Phase 8.0: the stress channel ──────────────────────────────────────────
check("the speller marks exactly one stressed syllable", () => {
  // This channel is the prerequisite for four later steps and it makes NO SOUND, so nothing
  // else in the gate can see it go wrong. Without a check it could rot silently for months
  // and then be discovered as a duration bug, which is the expensive way round.
  const S = require(__dirname + "/../engine/spelling.js");
  const bad = [];
  // Three separate claims, because they fail for different reasons and a merged assertion
  // would not say which.
  //
  // 1. The channel stays parallel to the phones. If these ever drift out of step, every
  //    consumer indexes the wrong syllable and the symptom is a timing bug nowhere near here.
  //    The multi-word path is included because it is where the lengths are assembled by hand.
  for (const w of ["goal", "computer", "hey sexy lady", "the quick brown fox", "hmm"]) {
    const r = S.g2p(w);
    if (r.stress.length !== r.ph.length) bad.push(`${w}: ${r.ph.length}ph/${r.stress.length}st`);
  }
  // 2. One primary per word, and every word gets one. Zero means a word spoken flat; two
  //    means the syllable walk double-counted, which is what an off-by-one in the coda
  //    length would look like.
  for (const w of ["goal","atlas","computer","possibility","banana","strengths","hmm"]) {
    const r = S.g2pWord(w);
    const n = r.syl.filter(s => s.stress === 1).length;
    const want = r.syl.length ? 1 : 0;         // a vowelless word has no syllable to stress
    if (n !== want) bad.push(`${w}: ${n} primary of ${r.syl.length}`);
  }
  // 3. Known answers. Chosen because each one broke a different draft of the rules: atlas and
  //    better both took stress from the loose WEAK_FIRST prefix, kitchen tests that the
  //    two-symbol affricate /tʃ/ is a legal onset, atlas that /tl/ is not, possibility the
  //    antepenultimate suffix, and banana that the exception list is consulted at all.
  const WANT = { goal:[1,0], atlas:[2,0], better:[2,0], kitchen:[2,0], water:[2,0],
                 computer:[3,1], together:[3,1], about:[2,1], banana:[3,1],
                 possibility:[5,2], maximus:[3,0], street:[1,0] };
  for (const [w, [nsyl, pri]] of Object.entries(WANT)) {
    const r = S.g2pWord(w);
    if (r.syl.length !== nsyl || r.primary !== pri)
      bad.push(`${w}: ${r.syl.length}syl@${r.primary} want ${nsyl}@${pri}`);
  }
  // The greedy "augh" rule that made daughter into "daffter". Not a stress fact, but it was
  // found by reading this word's syllables and it belongs with the case that caught it.
  // Whole-word shapes the letter rules cannot see, because they only ever match a SUFFIX.
  // "my" was /mi/ and "she" was a bare /ʃ/ with no vowel at all — five of the hundred
  // commonest words in English were silent consonants. The negative cases matter as much:
  // "happy" must keep its /i/ and "style" must keep its own vowel rather than borrowing one.
  // And the final -s rule must fire after a voiced consonant and nowhere else.
  for (const [w, want] of [["daughter","d.ɔ.t.ɝ"], ["taught","t.ɔ.t"], ["laugh","l.æ.f"],
                           ["laughter","l.æ.f.t.ɝ"], ["slaughter","s.l.ɔ.t.ɝ"],
                           ["my","m.aɪ"], ["why","w.aɪ"], ["sky","s.k.aɪ"],
                           ["happy","h.æ.p.i"], ["city","s.ɪ.t.i"],
                           ["be","b.i"], ["she","ʃ.i"], ["we","w.i"], ["me","m.i"],
                           ["I","aɪ"], ["a","ə"],
                           ["peter","p.i.t.ɝ"], ["piper","p.aɪ.p.ɝ"], ["lazy","l.eɪ.z.i"],
                           ["city","s.ɪ.t.i"], ["river","r.ɪ.v.ɝ"],
                           ["banana","b.ə.n.æ.n.ə"], ["cabin","k.æ.b.ɪ.n"],
                           ["sells","s.ɛ.l.z"], ["dogs","d.ɑ.g.z"],
                           ["cats","k.æ.t.s"], ["bus","b.ʌ.s"], ["glass","g.l.æ.s"],
                           ["horse","h.ɔ.r.s"]]) {
    const got = S.g2pWord(w).ph.join(".");
    if (got !== want) bad.push(`${w}: ${got} want ${want}`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
                            : "parallel, one primary each, 12 known patterns" };
});

// ── Phase 8.1: the duration weights ────────────────────────────────────────
check("duration follows the segments, not a flat share", () => {
  const P = H.P, D = 1.0, n = 44;
  const S = require(__dirname + "/../engine/spelling.js");
  const held = (chain, dur, stress) => {
    const W = P.buildWord(chain, { D: dur, n, stress });
    return { W, seg: W.seg.filter(s => s.sym !== " " && !P.STOP_KEYS.includes(s.sym)) };
  };
  const bad = [];
  const near = (got, want, tol, what) => {
    if (Math.abs(got - want)/want > tol) bad.push(`${what} ${got.toFixed(3)} want ~${want}`);
  };

  // 1. The rules point the right way, at unit level, before any of it is composed.
  //    Exact equality — this cannot be flaky and it localises a wrong table instantly.
  const cf = P.codaFactor;
  if (cf(["æ","d"],0) !== P.CODA_VOICED)    bad.push("coda /d/ not voiced");
  if (cf(["æ","t"],0) !== P.CODA_VOICELESS) bad.push("coda /t/ not voiceless");
  if (cf(["æ","n"],0) !== P.CODA_SONORANT)  bad.push("coda /n/ not sonorant");
  if (cf(["æ","ɑ"],0) !== P.CODA_OPEN)      bad.push("vowel after vowel not open");
  if (cf(["æ"],0)     !== P.CODA_OPEN)      bad.push("word-final not open");
  if (cf(["æ"," ","d"],0) !== P.CODA_OPEN)  bad.push("word boundary not open");

  // 2. Voiced-coda lengthening, on a controlled pair: only the coda differs, and the vowel
  //    is non-final in BOTH so final lengthening cannot confound it. The measured ratio is
  //    1.20 rather than the table's 1.50 because the weights are normalised against their
  //    own sum — lengthening the vowel takes time from the schwa. That compression is the
  //    documented consequence of D being an absolute duration; see 8.1b.
  const A = held(["b","æ","d","ə"], D), B = held(["b","æ","t","ə"], D);
  //    1.285, not the 1.199 measured before the glide cap. That band moved for a stated
  //    reason and in the right direction: capping the glide returns time to the pool, so less
  //    of the 1.50 in the table is compressed away by the normalisation, and the measured
  //    ratio moves TOWARD the truth rather than away from it.
  near((A.seg[0].b-A.seg[0].a)/(B.seg[0].b-B.seg[0].a), 1.285, 0.05, "bad/bat vowel ratio");
  //    ...and the word is the same length either way. The rhythm moves, the rate does not.
  //    Compared with a tolerance rather than ===. It was exact until 8.2 gave voiced and
  //    voiceless stops different closures: the two chains now sum the same total along
  //    different arithmetic paths and land 2e-16 apart. Asserting bit-equality on a float
  //    sum was over-strict, and the thing worth asserting is that the word did not change
  //    length — not that two additions happened in the same order.
  if (Math.abs(A.W.end - B.W.end) > 1e-9)
    bad.push(`coda changed word length ${A.W.end} vs ${B.W.end}`);

  // 3. Stress. banana is the case the speller's exception list exists for, so this also
  //    fails loudly if that lookup regresses.
  const ban = S.g2p("banana"), N = held(ban.ph, D, ban.stress);
  const v = N.seg.map(s => s.b - s.a);
  if (!(v[2]/Math.min(v[0], v[4]) > 1.8))
    bad.push(`banana stressed/unstressed ${(v[2]/Math.min(v[0],v[4])).toFixed(2)} want >1.8`);
  //    Stress redistributes; it does not lengthen the word.
  if (Math.abs(N.W.end - held(ban.ph, D, null).W.end) > 1e-12)
    bad.push("stress changed word length");

  // 4. RATE INVARIANCE. The point of normalising: change the tempo and every held segment
  //    keeps its share. Stops are excluded because stopHold is a fixed absolute time and
  //    always was, so a stop's share genuinely does move with D.
  const s1 = held(ban.ph, 0.8, ban.stress).seg.map(s => s.b - s.a);
  const s2 = held(ban.ph, 1.9, ban.stress).seg.map(s => s.b - s.a);
  let drift = 0;
  for (let i = 0; i < s1.length; i++) for (let j = 0; j < s1.length; j++)
    drift = Math.max(drift, Math.abs((s1[i]/s1[j]) - (s2[i]/s2[j]))/(s1[i]/s1[j]));
  if (drift > 1e-9) bad.push(`ratios drift with D by ${drift.toExponential(1)}`);

  // 4b. NO SEGMENT MAY BE SHORTER THAN THE GLIDE INTO IT. `glide` is an absolute time that
  //     never scaled with what it joined; 8.1 made unstressed segments short and walked into
  //     it, leaving the tract still travelling toward a target when it was told to leave for
  //     the next one. That is what slur is, and it is why Phase 8 was not a net improvement
  //     until this was capped. Measured inside words only — a pause is silence, not transit,
  //     and counting it was what made the first version of this metric read the same in every
  //     condition.
  {
    const rr = S.g2p("banana and a tomato");
    const WW = P.buildWord(rr.ph, { D: 2.0, n: 40, stress: rr.stress, pros: v,
                                    glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    let starved = 0, arr = [];
    for (let i = 1; i < WW.seg.length; i++) {
      if (WW.seg[i].sym === " " || WW.seg[i-1].sym === " ") continue;
      const dd = WW.seg[i].b - WW.seg[i].a, gg = WW.seg[i].a - WW.seg[i-1].b;
      arr.push(Math.max(0, 1 - gg/dd));
      if (gg >= dd) starved++;
    }
    const mean = arr.reduce((x,y) => x+y, 0)/arr.length;
    if (starved) bad.push(`${starved} segments never reach their target`);
    if (mean < 0.5) bad.push(`only ${(mean*100).toFixed(0)}% of segment time is spent at target`);
  }

  // 5. The approximants must not drift as a side effect of rescaling the vowels. The first
  //    draft left /l/ at a bare 0.34 while a vowel went from 1 to about 1.5, and the /l/ of
  //    "goal" quietly lost a third of its length — 204 ms to 134 ms. Nobody asked for that.
  const G = held(["g","o","l"], D), tot = G.seg.reduce((a,s) => a + (s.b-s.a), 0);
  near((G.seg[1].b-G.seg[1].a)/tot, 0.231, 0.06, "goal /l/ share");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : "coda 1.20x, stress 2.9x, rate-invariant to 1e-16, /l/ held at 23%" };
});

report("no fricative strays into another's band", () => {
  // /ð/ in "mother" came out as a static sh. Not a bug in the sound — it was in the WRONG
  // BAND. An automatic fit chasing a spectral target had moved the dental constriction back
  // to 0.78, giving it a front cavity the size of /ʃ/'s, so it duly became a /ʃ/. A dental
  // is made at the teeth with nothing in front to ring.
  // What separates a sibilant from a dental is not where its centroid sits — those overlap.
  // It is that a sibilant is LOUD and CONCENTRATED (jet on the teeth, cavity to ring) and a
  // dental is weak and diffuse (neither). Measure that, and by band share rather than peak:
  // on a noise source the peak wanders 84% between renders, and three checks in this file
  // went flaky before I stopped using it.
  // AVERAGING, sized against measured variance rather than picked. Per render: /ʃ/ high-share
  // is 40.4% ±12.1% and /ð/ 31.0% ±13.4%, so at three renders the two distributions overlap
  // often enough to trip the 0.95 margin about 2% of the time — and it did, once in seven runs
  // while checking something unrelated. A gate that fails at random is worse than one that
  // fails, because the next green tick means nothing. Averaged over longer renders with more
  // spectral hops, which buys the same variance reduction far cheaper than more renders do.
  //
  // NOTE, and it wants looking at: the LEVEL half of this test is currently vacuous. /ð/
  // measures 0.0202 against /ʃ/'s 0.0173 — the dental is LOUDER than the sibilant, so
  // `l > shL*0.95` is always true and the whole check rests on the high-share half alone.
  // That is not what "weaker OR duller" was meant to mean. It predates the sibilant rescale
  // (the gate's own notes show ð 82% of a vowel against ʃ 78% well before it). Recorded here
  // rather than patched, because the fix belongs in the fricative levels, not in the band.
  const lvl = sym => { let a = 0;
    for (let i = 0; i < 3; i++) a += H.rms(H.sustain(sym, { seconds: 1.0 }), 0.45, 0.9);
    return a/3; };
  const high = sym => { let a = 0;
    for (let i = 0; i < 4; i++)
      a += H.bandShare(H.spectrum(H.sustain(sym, { seconds: 1.8 }),
                                  { lo: 300, hi: 9000, step: 200, hops: 20 }), 3000, 9000);
    return a/4; };
  const shL = lvl("ʃ"), shH = high("ʃ");
  const bad = [];
  for (const sym of ["f", "v", "θ", "ð"]) {
    const l = lvl(sym), h = high(sym);
    // a dental must be clearly weaker OR clearly less high-concentrated than /ʃ/
    if (l > shL*0.95 && h > shH*0.95) bad.push(`${sym} as strong and as bright as ʃ`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
                            : `dentals and labiodentals weaker or duller than /ʃ/ (${(shH).toFixed(0)}% high)` };
});

// ── words behave ───────────────────────────────────────────────────────────
const WORDS = [["g","o","ɑ","l"], ["b","ʊ","l","d","ɔ","g"], ["m","æ","k","s","ɪ","m","ə","s"],
               ["d","æ","d"], ["s","o","l","ɑ","n","ə"]];

// ── Phase 8.2: stop closures ───────────────────────────────────────────────
check("stops hold for as long as their voicing allows", () => {
  const P = H.P, bad = [];
  // 1. A voiced closure cannot be held — oral pressure meets subglottal and the folds stop —
  //    so it is short where a voiceless one is not. Asserted as a ratio so it follows the
  //    voice's own stopHold instead of pinning the gate to one absolute millisecond value.
  const seg = ch => { const o = {}; P.buildWord(ch, { D: 1.0, n: 44 }).seg
                        .forEach((s, i) => o[s.sym + "#" + i] = s.b - s.a); return o; };
  const a = seg(["b","æ","d"]), b = seg(["p","æ","t"]);
  const vd = a["b#0"], vl = b["p#0"];
  if (Math.abs(vl/vd - 1.5) > 0.02) bad.push(`voiceless/voiced closure ${(vl/vd).toFixed(2)} want 1.50`);
  if (Math.abs(a["b#0"] - a["d#2"]) > 1e-12) bad.push("two voiced closures differ");

  // 2. Same invariant 8.1 holds: the split moves, the word length does not. If this ever
  //    fails, every band elsewhere in the gate is about to move for no stated reason.
  const ends = [["b","æ","d"],["p","æ","t"],["b","æ","b"],["b","ʊ","l","d","ɔ","g"]]
                 .map(ch => P.buildWord(ch, { D: 1.0, n: 44 }).end);
  if (Math.max(...ends) - Math.min(...ends) > 1e-12)
    bad.push(`word length moved with the stops: ${ends.map(e=>e.toFixed(4)).join(" ")}`);

  // 3. English word-final stops are usually UNRELEASED, and this engine already does that —
  //    the tract never reopens at word end, so no burst fires. It arrived by accident rather
  //    than by decision and nothing was holding it in place, which is what this is for. The
  //    medial half of the pair matters as much: without it the check would still pass if
  //    bursts stopped working altogether.
  //    Both words are in WORDS, so these renders are already in the cache.
  const burst = (ch, sym, idx) => {
    const { buf, seg: sg } = H.say(ch);
    const st = sg.filter(s => s.sym === sym)[idx], vw = sg.find(s => P.VOWEL_KEYS.includes(s.sym));
    const pk = (x, y) => { let m = 0;
      for (let i = Math.floor(x*H.SR); i < Math.min(buf.length, Math.floor(y*H.SR)); i++)
        m = Math.max(m, Math.abs(buf[i])); return m; };
    return pk(st.b, st.b + 0.06) / Math.max(1e-9, pk(vw.a, vw.b));
  };
  const medial = burst(["b","ʊ","l","d","ɔ","g"], "d", 0);
  const final  = burst(["b","ʊ","l","d","ɔ","g"], "g", 0);
  const final2 = burst(["d","æ","d"], "d", 1);
  if (!(medial > 0.25)) bad.push(`medial /d/ did not release (${(medial*100).toFixed(0)}%)`);
  if (final  > 0.10) bad.push(`final /g/ released (${(final*100).toFixed(0)}%)`);
  if (final2 > 0.10) bad.push(`final /d/ released (${(final2*100).toFixed(0)}%)`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `closures 60/90ms, word length fixed, finals unreleased (${(final*100).toFixed(0)}% vs medial ${(medial*100).toFixed(0)}%)` };
});

// ── Phase 8.3: level ───────────────────────────────────────────────────────
check("stress makes a syllable quieter as well as shorter", () => {
  const S = require(__dirname + "/../engine/spelling.js");
  const V = H.P.VOICES.john.v, n = Math.round(V.sect);
  const r = S.g2p("banana");
  const lvl = st => {
    const { buf, seg } = H.say(r.ph, { D: 1.1, voice: V, n, stress: st });
    return seg.filter(s => s.sym === "ə" || s.sym === "æ")
              .map(s => [s.sym, 20*Math.log10(H.rms(buf, s.a + 0.03, s.b - 0.03) + 1e-12)]);
  };
  const bad = [];
  // 8.1 made the stressed syllable longer. Before this it was still the same LEVEL — three
  // syllables of "banana" measured within 0.9 dB of each other, where real speech puts an
  // unstressed one 3-6 dB down.
  const on = lvl(r.stress);
  const str = on.find(x => x[0] === "æ")[1];
  const weak = Math.max(...on.filter(x => x[0] === "ə").map(x => x[1]));
  if (!(str - weak > 3)) bad.push(`stressed only ${(str-weak).toFixed(1)} dB up, want >3`);

  // And the default path must be untouched: a chain tapped in by hand, or anything that never
  // went through the speller, supplies no stress and has to sound exactly as it did.
  const off = lvl(null);
  const spread = Math.max(...off.map(x => x[1])) - Math.min(...off.map(x => x[1]));
  if (spread > 1.5) bad.push(`no-stress path not flat: ${spread.toFixed(1)} dB`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `stressed +${(str-weak).toFixed(1)} dB, flat without stress (${spread.toFixed(1)} dB)` };
});

report("open vowels carry more than close ones, from the tube alone", () => {
  // NOT something the code says anywhere. A wide mouth radiates more efficiently than a
  // rounded one and the lip section carries that, so the intrinsic loudness of a vowel falls
  // out of its shape. Measured before 8.3 was written, which is why 8.3 did not add a
  // per-vowel gain table: it would have double-counted geometry the model already has.
  const V = H.P.VOICES.john.v, n = Math.round(V.sect);
  const db = {};
  for (const s of ["ɑ","æ","ɛ","ʌ","ɔ","o","ɝ","ʊ","ɪ","i","u"])
    db[s] = 20*Math.log10(H.rms(H.sustain(s, { n, voice: V, f0: 110, seconds: 1.0 }), 0.35, 0.95) + 1e-12);
  const span = Math.max(...Object.values(db)) - Math.min(...Object.values(db));
  const ok = span > 3 && span < 9 && db["ɑ"] > db["u"] && db["ɑ"] > db["i"];
  const order = Object.entries(db).sort((a,b) => b[1]-a[1]);
  const top = order[0][1];
  return { ok, note: `span ${span.toFixed(1)} dB (real 4-6): ` +
           order.map(([s,v]) => s + (v-top).toFixed(1)).join(" ") };
});

// ── the prosody knobs are reachable ────────────────────────────────────────
check("every prosody knob is swept, seeded and does something", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js");
  const bad = [], r = S.g2p("banana and a tomato"), D = 1.6;
  const durs = pros => P.buildWord(r.ph, { D, n: 44, stress: r.stress, pros })
                        .seg.filter(s => s.sym !== " ").map(s => s.b - s.a);
  // Split by what they move. wklev is a LEVEL knob and changes no duration at all, so putting
  // it through the duration loop would demand it do something it is not for. Caught by this
  // check on its first run, which is the argument for writing it this way.
  const DUR_KNOBS = ["vlen","coda","wkdur","fnl","poly","stopVc","apw"];
  const LEV_KNOBS = ["wklev"];
  const KNOBS = [...DUR_KNOBS, ...LEV_KNOBS];

  // 1. Passing the published defaults must be BIT-IDENTICAL to passing nothing. This is the
  //    whole claim of the refactor — it exposed the constants, it did not retune them — and
  //    if it ever stops being true, every band tuned before today was tuned against
  //    something else. Exact, not tolerant: the scaling form was chosen so unity is exact.
  const none = P.buildWord(r.ph, { D, n: 44, stress: r.stress });
  const dflt = P.buildWord(r.ph, { D, n: 44, stress: r.stress, pros: P.defaultVoice() });
  if (JSON.stringify(none.seg) !== JSON.stringify(dflt.seg) ||
      JSON.stringify(none.keys.map(k => [k.t, k.lv])) !== JSON.stringify(dflt.keys.map(k => [k.t, k.lv])))
    bad.push("defaults are not identical to no-pros");

  // 2. Each one is in VOICE_SPEC — otherwise it cannot be swept, seeded or set per voice,
  //    which is the entire point — and each one actually moves the output when turned to the
  //    end of its range. A knob that is wired but inert is worse than one that is missing.
  const spec = Object.fromEntries(P.VOICE_SPEC.map(p => [p.k, p]));
  const base = durs(P.defaultVoice());
  for (const k of LEV_KNOBS) if (!spec[k]) bad.push(`${k} not in VOICE_SPEC`);
  for (const k of DUR_KNOBS) {
    if (!spec[k]) { bad.push(`${k} not in VOICE_SPEC`); continue; }
    const moved = durs({ ...P.defaultVoice(), [k]: spec[k].lo }).some((v, i) => v !== base[i])
               || durs({ ...P.defaultVoice(), [k]: spec[k].hi }).some((v, i) => v !== base[i]);
    if (!moved) bad.push(`${k} changes nothing across its range`);
  }
  // wklev moves level, not duration, so it is checked on the keyframes instead.
  const lv = p => P.buildWord(r.ph, { D, n: 44, stress: r.stress, pros: p }).keys.map(k => k.lv);
  if (JSON.stringify(lv({ ...P.defaultVoice(), wklev: 1 })) === JSON.stringify(lv(P.defaultVoice())))
    bad.push("wklev changes nothing");

  // 3. The seed carries them. THE REAL CODEC, not a copy of it — this check used to carry its
  //    own encode/decode, which is the same mistake the harness once made with buildWord and
  //    the page made with the F0 contour. A gate testing its own reimplementation of a thing
  //    is not testing the thing.
  const SPEC = P.VOICE_SPEC, enc = P.encodeVoice, dec = P.decodeVoice;
  const tuned = { ...P.defaultVoice(), vlen:0.4, coda:1.7, wkdur:0.45, wklev:0.8,
                  fnl:1.5, poly:0.25, stopVc:1.8, apw:0.6 };
  const back = dec(enc(tuned));
  for (const k of KNOBS)
    if (Math.abs(back[k]-tuned[k])/(spec[k].hi-spec[k].lo) > 1/1295)
      bad.push(`${k} does not survive the seed`);
  // Appended rather than inserted, so a seed written before the prosody knobs existed still
  // loads and the new ones take their published values.
  const older = dec(enc(P.defaultVoice()).slice(0, 36));
  for (const k of KNOBS) if (older[k] !== spec[k].d) bad.push(`old seed broke ${k}`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `${KNOBS.length} knobs live, defaults identical, ${SPEC.length*2}-char seed round-trips` };
});

// ── Phase 8.4: the pitch contour ───────────────────────────────────────────
check("pitch moves in semitones and accents land on stressed syllables", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js"), bad = [];

  // 1. ONE COPY. This lived in four places — index.html twice, the harness and the bench — and
  //    the harness's own near-copy of buildWord is the precedent for why that matters: a gate
  //    with a slightly different copy tests the wrong thing. Structural, so it stays one.
  const fs = require("fs");
  for (const f of ["index.html", "lab/harness.js", "lab/bench.html"]) {
    const t = fs.readFileSync(__dirname + "/../" + f, "utf8");
    if (/\[\s*end\s*\*\s*0\.55\s*,/.test(t)) bad.push(`${f} builds its own contour again`);
  }

  // 2. SEMITONES. Driven through the real processor, not the helper, because the engine does
  //    its own interpolation and that is the copy that was wrong. A fall from 200 to 100 has
  //    its perceptual midpoint at the geometric mean, 141.4 — linear-in-Hz gives 150.
  const n = 44, p = H.makeProcessor(n);
  p.port.onmessage({ data: { type: "voice", v: P.defaultVoice() } });
  const keys = [{ t: 0, d: Array.from(P.articulate(P.ART["ɑ"], n)), b: 0, nz: 0, vl: 0, fr: 0, as: 0 },
                { t: 1, d: Array.from(P.articulate(P.ART["ɑ"], n)), b: 0, nz: 0, vl: 0, fr: 0, as: 0 }];
  p.port.onmessage({ data: { type: "goal", seq: { keys, f0: [[0,200],[1,100]], end: 1 } } });
  const out = [new Float32Array(128)];
  for (let i = 0; i < Math.floor(0.5 * H.SR / 128); i++) p.process([], [out]);
  const mid = p.f0;
  if (Math.abs(mid - 141.4) > 3) bad.push(`midpoint of a 200->100 fall is ${mid.toFixed(1)} Hz, want ~141 (150 = still linear in Hz)`);

  // 3. Accents land on stressed NUCLEI and nowhere else. `stress` marks every phone of a
  //    stressed syllable, so accenting all of them would put three excursions on one syllable
  //    and read as a wobble rather than an accent.
  //    Measured against the baseline with perturbation OFF, because the two overlap on a short
  //    vowel and the question here is only where the accents are. The first version of this
  //    asserted that every point in the contour sat inside a stressed nucleus, which stopped
  //    being true the moment perturbation started adding its own breakpoints on unstressed
  //    ones — the assertion was stale, not the code.
  const v = P.defaultVoice(), noP = { ...v, pert: 0 };
  const r = S.g2p("banana and a tomato");
  const W = P.buildWord(r.ph, { D: 1.6, n: 44, stress: r.stress, pros: v });
  const base = P.buildF0(W.end, noP);
  const acc  = P.buildF0(W.end, noP, { stress: r.stress, seg: W.seg });
  const isNuc = sym => P.VDUR[sym] !== undefined || P.DIPH[sym] !== undefined;
  const readAt = (pts, t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) {
      const [t0,v0] = pts[k-1], [t1,v1] = pts[k];
      return t1 === t0 ? v1 : v0*Math.pow(v1/v0, (t-t0)/(t1-t0));
    }
    return pts[pts.length-1][1];
  };
  let nStressed = 0;
  W.seg.forEach((sg, i) => {
    if (sg.sym === " " || !isNuc(sg.sym)) return;
    const mid = (sg.a + sg.b)/2;
    const lift = 12*Math.log2(readAt(acc, mid) / readAt(base, mid));
    if (r.stress[i]) { nStressed++;
      if (Math.abs(lift - v.acc) > 0.2) bad.push(`stressed /${sg.sym}/ lifted ${lift.toFixed(2)} st, want ${v.acc}`);
    } else if (Math.abs(lift) > 0.2) bad.push(`UNstressed /${sg.sym}/ lifted ${lift.toFixed(2)} st`);
  });
  if (!nStressed) bad.push("no stressed nuclei found to test");

  // 4. CONSONANT PERTURBATION. A vowel after a voiceless obstruent starts high and falls in;
  //    after a voiced one it starts low and rises. Asymmetric, and gone within ~60 ms.
  //    Asserted in SEMITONES, not hertz, because that is how it is defined and how it scales:
  //    1.9 st is 28 Hz on this 250 Hz voice and 11 Hz on John's 95, and the published 10-25 Hz
  //    is quoted for male voices. In hertz this assertion would be voice-dependent.
  const onset = ch => {
    const W2 = P.buildWord(ch, { D: 0.8, n: 44, stress: [1,1,1], pros: v });
    const f  = P.buildF0(W2.end, v, { stress: [1,1,1], seg: W2.seg });
    const vw = W2.seg[1];
    const b2 = P.buildF0(W2.end, v);
    const rd = (pts, t) => { if (t <= pts[0][0]) return pts[0][1];
      for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) {
        const [t0,v0] = pts[k-1], [t1,v1] = pts[k];
        return t1 === t0 ? v1 : v0*Math.pow(v1/v0, (t-t0)/(t1-t0)); }
      return pts[pts.length-1][1]; };
    return { on: f.find(x => Math.abs(x[0]-vw.a) < 1e-9)[1],
             lift: 12*Math.log2(rd(f, vw.a)/rd(b2, vw.a)),
             peak: Math.max(...f.filter(x => x[0] >= vw.a && x[0] <= vw.b).map(x => x[1])) };
  };
  //    Each chain against ITS OWN baseline, not against each other. Comparing the two onsets
  //    directly was confounded: 8.2 gave /t/ and /d/ different closure durations, so the vowel
  //    starts at a different time in each and the baseline is rising there — the check was
  //    measuring perturbation plus baseline drift and happened to land near 1.9 anyway. The
  //    glide cap moved the onsets further apart and the confound surfaced as a failure.
  const vl = onset(["t","ɑ","t"]), vd = onset(["d","ɑ","d"]);
  const st = vl.lift - vd.lift;
  if (Math.abs(vl.lift - 1.2) > 0.05) bad.push(`after /t/ lifted ${vl.lift.toFixed(2)} st, want 1.2`);
  if (Math.abs(vd.lift + 0.7) > 0.05) bad.push(`after /d/ lifted ${vd.lift.toFixed(2)} st, want -0.7`);
  // It must DECAY. If it did not, it would be an accent rather than microprosody, and the two
  // syllables would not reach the same peak.
  if (Math.abs(vl.peak - vd.peak) > 0.5) bad.push("perturbation does not decay before the accent");
  // And it must not double-count with the accent that sits on the same vowel. Two ramps meet
  // at the accent's peak; counting both would give 6 semitones where the knob says 3.
  const W3 = P.buildWord(["d","ɑ","d"], { D: 0.8, n: 44, stress: [1,1,1], pros: v });
  const exc = 12*Math.log2(Math.max(...P.buildF0(W3.end, v, { stress:[1,1,1], seg:W3.seg }).map(x=>x[1]))
                         / Math.max(...P.buildF0(W3.end, v).map(x=>x[1])));
  if (Math.abs(exc - 3) > 0.15) bad.push(`accent excursion ${exc.toFixed(2)} st, want 3 (6 = double-counted)`);
  if (JSON.stringify(P.buildF0(W3.end, { ...v, pert: 0, acc: 0 }, { stress:[1,1,1], seg:W3.seg }))
      !== JSON.stringify(P.buildF0(W3.end, v)))
    bad.push("pert=0 acc=0 does not return the baseline");

  // 5. Turning BOTH off returns the baseline exactly — asserted in 4. acc=0 alone must NOT,
  //    because perturbation is a separate effect and switching one knob should not silently
  //    disable the other. That was the first version's mistake.
  if (JSON.stringify(P.buildF0(W.end, { ...v, acc: 0 }, { stress: r.stress, seg: W.seg }))
      === JSON.stringify(P.buildF0(W.end, v)))
    bad.push("acc=0 also disabled perturbation");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `one copy, 200->100 midpoint ${mid.toFixed(0)} Hz, ${nStressed} accents at ${v.acc} st, perturbation ${st.toFixed(1)} st, no double-count` };
});

// ── every knob is reachable, and the whole phase can be switched off ───────
check("Phase 8 nulls out cleanly, back to the engine before it", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js"), bad = [];

  // 1. Every declared null is inside its own range. A null outside [lo,hi] would be clamped on
  //    the way in and the button would quietly do something other than what it says.
  for (const p of P.VOICE_SPEC) {
    if (p.off === undefined) continue;
    if (p.off < p.lo || p.off > p.hi) bad.push(`${p.k} off=${p.off} outside [${p.lo},${p.hi}]`);
  }
  const p8 = P.VOICE_SPEC.filter(p => p.p8);
  if (p8.length < 9) bad.push(`only ${p8.length} knobs marked p8`);

  // 1b. EVERY KNOB THE ENGINE READS MUST BE DECLARED. buildWord reads its parameters through
  //     P_('name', default), and buildF0 off the voice object. A name read but never put in
  //     VOICE_SPEC still WORKS — it silently takes its inline default — while being invisible
  //     to everything: not in the seed, not in a group, not settable, no null, and not missed
  //     by the partition check either, because it is not in the spec to be missing from.
  //     `gcap` shipped exactly like that: a str.replace whose anchor did not exist, on a branch
  //     where the anchor had never landed, and no assertion on the match. This is the check
  //     that catches the whole class rather than that one instance.
  const ph = require("fs").readFileSync(__dirname + "/../engine/phonemes.js", "utf8");
  const declared = new Set(P.VOICE_SPEC.map(x => x.k));
  const read = new Set();
  for (const m of ph.matchAll(/P_\(\s*'([A-Za-z_$][\w$]*)'/g)) read.add(m[1]);
  for (const m of ph.matchAll(/v\.([A-Za-z_$][\w$]*)\s*===\s*undefined/g)) read.add(m[1]);
  const undeclared = [...read].filter(k => !declared.has(k));
  if (undeclared.length) bad.push(`read by the engine but not in VOICE_SPEC: ${undeclared.join(" ")}`);

  // 2. THE CLAIM. Null the whole Phase 8 layer and the engine has to behave as it did before
  //    any of 8.1 to 8.4 existed: every held segment the same length, every stop the same
  //    closure, every level 1, and the pitch contour back to the bare baseline. If that stops
  //    being true then "turn it off and listen" is not a bisection, it is a fourth thing to
  //    debug — and the knobs exist precisely so a fault can be attributed.
  //    drawl is zeroed too because it is not a Phase 8 knob and predates all of this; it is
  //    the one other thing that lengthens a single segment.
  const off = { ...P.defaultVoice(), drawl: 0 };
  p8.forEach(p => off[p.k] = p.off);
  const r = S.g2p("banana and a tomato");
  const W = P.buildWord(r.ph, { D: 1.6, n: 44, stress: r.stress, pros: off, stopHold: off.stopT });
  const dur = x => +((x.b - x.a).toFixed(9));
  const held = W.seg.filter(s => s.sym !== " " && !P.STOP_KEYS.includes(s.sym)
                              && !P.APPROX.includes(s.sym)).map(dur);
  if (new Set(held).size !== 1) bad.push(`held segments not equal: ${[...new Set(held)].join(" ")}`);
  const stops = W.seg.filter(s => P.STOP_KEYS.includes(s.sym));
  if (!stops.every(s => Math.abs((s.b - s.a) - off.stopT) < 1e-12))
    bad.push("stop closures differ from stopHold");
  if (!W.keys.every(k => k.lv === undefined || k.lv === 1)) bad.push("levels are not flat");
  if (JSON.stringify(P.buildF0(W.end, off, { stress: r.stress, seg: W.seg }))
      !== JSON.stringify(P.buildF0(W.end, off))) bad.push("contour is not the bare baseline");

  // 3. And it must be a real switch, not a no-op: with Phase 8 ON, none of those hold.
  const on = { ...P.defaultVoice(), drawl: 0 };
  const W2 = P.buildWord(r.ph, { D: 1.6, n: 44, stress: r.stress, pros: on, stopHold: on.stopT });
  const held2 = W2.seg.filter(s => s.sym !== " " && !P.STOP_KEYS.includes(s.sym)
                                && !P.APPROX.includes(s.sym)).map(dur);
  if (new Set(held2).size === 1) bad.push("Phase 8 ON also gives flat durations — the knobs do nothing");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `${P.VOICE_SPEC.filter(p=>p.off!==undefined).length} nulls declared, ${p8.length} in phase 8, off == pre-8.1` };
});

// ── the voice operations are shared, and the groups partition the spec ─────
check("one copy of the voice codec, and the groups cover it exactly", () => {
  const P = H.P, fs = require("fs"), bad = [];

  // 1. ONE COPY. This codec had two — index.html's and this check's own, which I wrote. A gate
  //    testing its own reimplementation of a thing is not testing the thing, and that is the
  //    same mistake the harness made with buildWord and the page made with the F0 contour.
  //    Structural, because it is the only kind of assertion that stops it happening a fourth time.
  for (const f of ["index.html", "lab/bench.html", "lab/check.js"]) {
    const t = fs.readFileSync(__dirname + "/../" + f, "utf8");
    if (/toString\(36\)\.padStart\(2/.test(t)) bad.push(`${f} has its own seed encoder again`);
  }

  // 2. The groups PARTITION the spec — every parameter in exactly one. A parameter in none is
  //    unreachable by the tournament and will never be tuned; a parameter in two moves twice
  //    as far per round as its neighbours and nobody would ever work out why.
  const spec = P.VOICE_SPEC.map(p => p.k);
  const grouped = Object.values(P.VOICE_GROUPS).flat();
  const dupes = grouped.filter((k, i) => grouped.indexOf(k) !== i);
  const missing = spec.filter(k => !grouped.includes(k));
  const unknown = grouped.filter(k => !spec.includes(k));
  if (dupes.length)   bad.push(`in two groups: ${[...new Set(dupes)].join(" ")}`);
  if (missing.length) bad.push(`in no group: ${missing.join(" ")}`);
  if (unknown.length) bad.push(`grouped but not in the spec: ${unknown.join(" ")}`);

  // 3. Mutating a group moves that group and nothing else. This is the whole reason the
  //    tournament moved: twenty-eight parameters at once tells an ear nothing per round.
  for (const [name, keys] of Object.entries(P.VOICE_GROUPS)) {
    const d = P.defaultVoice();
    const moved = new Set();
    for (let i = 0; i < 25; i++) {                 // several draws: one can leave a knob still
      const m = P.mutateVoice(d, 1, keys);
      for (const k of spec) if (m[k] !== d[k]) moved.add(k);
    }
    const stray = [...moved].filter(k => !keys.includes(k));
    if (stray.length) bad.push(`mutating ${name} moved ${stray.join(" ")}`);
    const inert = keys.filter(k => !moved.has(k));
    if (inert.length) bad.push(`${name}: ${inert.join(" ")} never moved`);
  }

  // 4. The codec still round-trips a mutated voice, and a short seed still loads.
  const v = P.mutateVoice(P.defaultVoice(), 1);
  if (P.encodeVoice(P.decodeVoice(P.encodeVoice(v))) !== P.encodeVoice(v))
    bad.push("seed does not round-trip");
  if (P.decodeVoice("zz") !== null) bad.push("a too-short seed should be rejected");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `${Object.keys(P.VOICE_GROUPS).length} groups partition ${spec.length} parameters, one codec` };
});

// ── two bugs the page had, and the shapes that let them hide ───────────────
check("no shadowed function declarations, and custom keeps its postures", () => {
  const fs = require("fs"), bad = [];
  const src = fs.readFileSync(__dirname + "/../index.html", "utf8")
                .match(/<script>([\s\S]*)<\/script>/)[1];

  // 1. A DUPLICATE TOP-LEVEL DECLARATION IS SILENT AND FATAL. There were two
  //    `function setVoice` in this one script — a voicing setter near the top and the preset
  //    switcher near the bottom. The later declaration wins, so every setVoice(1) was calling
  //    the PRESET setter with the number 1, looking up VOICES[1], and throwing on `V.v`. Hold
  //    and the space bar — two of the four controls the README documents — raised a TypeError
  //    and nothing else. Nothing caught it because the file parses perfectly.
  //    Braces at column 0 are the whole heuristic, which is enough for a file written this way.
  const decls = {};
  for (const m of src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm))
    decls[m[1]] = (decls[m[1]] || 0) + 1;
  const dup = Object.entries(decls).filter(([, n]) => n > 1);
  if (dup.length) bad.push(`declared twice: ${dup.map(([k, n]) => `${k} x${n}`).join(", ")}`);

  // 2. `custom` MUST INHERIT `art`. A seed carries 28 scalars; `art` is 26 postures of six
  //    numbers each and cannot go in one. So when goCustom() switches presets it has to carry
  //    the postures over by hand, or nudging any slider while John was selected silently
  //    swapped his measured tract for the shared one — and the voice changed character with
  //    nothing on screen to explain it. That is also the path a seed tuned in the bench takes
  //    on its way home, which is how it was found.
  const gc = src.match(/function goCustom\(\)\{[\s\S]*?\n\}/);
  if (!gc) bad.push("goCustom not found");
  else if (!/VOICES\.custom\.art\s*=/.test(gc[0]))
    bad.push("goCustom does not carry art onto custom");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `${Object.keys(decls).length} top-level functions, no shadowing, custom inherits art` };
});

// ── the voice does not rise toward Nyquist ─────────────────────────────────
check("breath noise rolls off instead of climbing", () => {
  const P = H.P, V = P.VOICES.john.v, n = Math.round(V.sect), bad = [];
  const v = { ...P.defaultVoice(), ...V };
  // Radiation at the lips is a differentiator, +6 dB/oct. A source that does not roll off to
  // compensate makes the whole voice climb toward Nyquist — measured at +4.4 dB/oct on a
  // sustained /ɑ/ where real speech falls. This went unnoticed for a long time because it is
  // not a wrong note, a wrong formant or a wrong level; it is a wrong SLOPE, and nothing was
  // looking at slopes.
  const tilt = buf => {
    const sp = H.spectrum(buf, { from: 0.35, lo: 4000, hi: 20000, step: 500, hops: 12 });
    let m = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const [f, db] of sp) { const x = Math.log2(f); m++; sx += x; sy += db; sxy += x*db; sxx += x*x; }
    return (m*sxy - sx*sy)/(m*sxx - sx*sx);
  };
  // Measured on UNBRANCHED vowels only. /l/ was in this list and failed at +2.3 dB/oct with the
  // fix in place — not because the source climbs but because the lateral's closed pocket is a
  // high-Q resonator sitting near 5.5 kHz, squarely inside the 4-20 kHz band. Measuring the
  // source's slope through a side branch measures the branch. This check is about the source.
  const t = {};
  for (const s of ["ɑ", "ə", "i", "u"]) t[s] = tilt(H.sustain(s, { n, voice: v, f0: 95, seconds: 1.0 }));
  for (const [s, d] of Object.entries(t))
    if (d > -2) bad.push(`/${s}/ tilts ${d.toFixed(1)} dB/oct — the voice is climbing`);

  // And it must be the BREATH that is shaped, not the whole voice quietly turned down. With
  // breath at zero the tilt says nothing about this fix, so the test is that raising breath
  // does not drag the slope back up.
  const loud = { ...v, brth: 0.34 };
  const hot = tilt(H.sustain("ɑ", { n, voice: loud, f0: 95, seconds: 1.0 }));
  if (hot > -2) bad.push(`at brth=0.34 the tilt is ${hot.toFixed(1)} dB/oct`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `ɑ ${t["ɑ"].toFixed(1)}  ə ${t["ə"].toFixed(1)}  i ${t["i"].toFixed(1)}  u ${t["u"].toFixed(1)} dB/oct, ` +
                 `${hot.toFixed(1)} at full breath (real aspiration: -6 to -12)` };
});

// ── a nasal is not a stop, however sealed the mouth is ─────────────────────
check("no stop burst fires behind an open velum", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js"), bad = [];
  const V = P.VOICES.john.v, n = Math.round(V.sect);
  const v = { ...P.defaultVoice(), ...V };
  // /m/ seals the lips, /n/ the ridge, /ŋ/ the velum — exactly as /b/, /d/ and /g/ do — so the
  // narrowest-diameter test that drives the burst cannot tell them apart. It charged behind
  // every nasal and fired a release on the way out: a sealed cavity let go under pressure,
  // which is a CLICK, and was heard as one. Counted at the processor rather than in the audio,
  // because the 20 ms after a nasal is mostly the next vowel and measuring peaks there was
  // confounded by it.
  let inNasal = 0, inStop = 0;
  for (const t of ["my mother and my brother", "banana and a tomato", "hello Jupiter and Maximus"]) {
    const r = S.g2p(t);
    const W = P.buildWord(r.ph, { D: Math.max(0.8, r.ph.length*v.per), n, stress: r.stress,
                                  pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    const p = H.makeProcessor(n);
    p.port.onmessage({ data: { type: "voice", v } });
    p.port.onmessage({ data: { type: "goal",
      seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
    const out = [new Float32Array(128)];
    let prev = 0;
    for (let b = 0; b < Math.ceil((W.end + 0.5)*H.SR/128); b++) {
      p.process([], [out]);
      if (p.burstN > prev) {
        const tt = b*128/H.SR;
        const sg = W.seg.find(x => tt >= x.a - 0.03 && tt <= x.b + 0.03);
        if (sg && P.NASAL[sg.sym]) inNasal++; else inStop++;
      }
      prev = p.burstN;
    }
  }
  if (inNasal) bad.push(`${inNasal} bursts fired behind a nasal`);
  // And the vent must not have silenced the stops it has no business touching. Eleven is what
  // these three phrases contain; a fix that suppressed those too would pass the first half.
  if (inStop < 8) bad.push(`only ${inStop} stop bursts survived — the vent is over-reaching`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ") : `0 behind nasals, ${inStop} at real stops` };
});

// ── the voice fitter recovers what it is given ─────────────────────────────
report("the fitter recovers a known vlen and poly", () => {
  // The roadmap's own rule: every metric should be checked against a case where the answer is
  // independently known before it is trusted to judge anything. This builds four synthetic
  // recordings with the truth planted in them and asks the fitter to find it.
  //
  // Built the way a SPEAKER works — a constant /h/+/d/ plus a vowel scaled by vlen — and NOT
  // through buildWord, which preserves total word duration by construction where a person does
  // not. The first version of this test did use buildWord and reported the fitter 17% low when
  // the fitter was right and the test was wrong.
  const P = H.P, fs = require("fs"), cp = require("child_process"), os = require("os"), path = require("path");
  const WV = { heed:"i", hid:"ɪ", head:"ɛ", had:"æ", hod:"ɑ",
               hawed:"ɔ", hood:"ʊ", whod:"u", hud:"ʌ", heard:"ɝ" };
  const PB = { i:[270,2290], "ɪ":[390,1990], "ɛ":[530,1840], "æ":[660,1720], "ɑ":[730,1090],
               "ɔ":[570,840], "ʊ":[440,1020], u:[300,870], "ʌ":[640,1190], "ɝ":[490,1350] };
  const out = [], bad = [];
  for (const truth of [0.4, 1.4]) {   // the extremes: what matters is that it is linear
    const rows = []; let t = 0;
    for (const [w, v] of Object.entries(WV)) {
      const d = 0.22 + 0.20*(1 + (P.VDUR[v]-1)*truth);
      rows.push({ label:w, a:t, b:t+d, f0:95, h1h2:4, F:[PB[v][0], PB[v][1], 2500, 3500] });
      t += d + 0.4;
    }
    for (const [w,k] of [["cap",1],["captain",2],["captaincy",3]]) {
      const d = k*0.30/(1 + 0.20*(k-1));
      rows.push({ label:w, a:t, b:t+d, f0:95, F:[] }); t += d + 0.4;
    }
    const f = path.join(os.tmpdir(), "fit-check-" + truth + ".json");
    fs.writeFileSync(f, JSON.stringify(rows));
    const txt = cp.execSync(`node ${__dirname}/fit-preset.js ${f} t`, { encoding: "utf8" });
    const gv = (txt.match(/vlen ([0-9.]+)/) || [])[1];
    const gp = (txt.match(/poly ([0-9.]+)/) || [])[1];
    if (gv === undefined) { bad.push(`vlen not reported at truth ${truth}`); continue; }
    out.push(`${truth}->${gv}`);
    // Within 15%: the estimate runs consistently high because the /h/+/d/ constant comes from
    // the model at a nominal rate and the speaker's is their own. A scale bias, not a wrong
    // shape — the same order as the ~8% low that RECORDING.md already records for tract length.
    if (Math.abs(+gv - truth)/truth > 0.15) bad.push(`vlen ${gv} from truth ${truth}`);
    if (Math.abs(+gp - 0.20) > 0.02) bad.push(`poly ${gp} from truth 0.20`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ") : `vlen ${out.join(" ")}, poly 0.20 exact` };
});

// ── a word does not start from digital silence ─────────────────────────────
check("phonation eases back in after a pause", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js"), bad = [];
  const V = P.VOICES.john.v, n = Math.round(V.sect);
  const r = S.g2p("I love my daughter");
  // Reported as a pop "before the L and D". It is neither a sample-level glitch nor trapped
  // air: the biggest sample jump at those onsets is SMALLER than at a mid-word transition in
  // the same phrase, which nobody hears. It is an onset from true digital silence — 3e-12 to
  // 1.3e-2 in about nine milliseconds — and the ear flags that as a click however smooth each
  // individual sample step is. So the thing to assert is a RISE TIME, not a discontinuity.
  const halfIn = on => {
    // wgap at its `off` value, because the ramp exists for REAL pauses — at an ordinary
    // word boundary there is now no silence to ease out of, which is the better fix.
    const v = { ...P.defaultVoice(), ...V, onset: on, wgap: 0.14 };
    const { buf } = H.say(r.ph, { D: Math.max(0.8, r.ph.length*v.per), voice: v, n, stress: r.stress });
    return [0.416, 1.026].map(t0 => {
      const full = H.rms(buf, t0 + 0.06, t0 + 0.10);
      for (let k = 0; k < 60; k++)
        if (H.rms(buf, t0 + k*0.001, t0 + k*0.001 + 0.004) > full*0.5) return k;
      return 60;
    });
  };
  const on = halfIn(0.035), off = halfIn(0);
  if (Math.min(...on) < 12) bad.push(`onset still reaches half amplitude in ${Math.min(...on)} ms`);
  // And it must be the knob doing it, not something else — with onset nulled the old instant
  // rise has to come back, or this check would pass on a build where the ramp does nothing.
  if (Math.min(...off) > 9) bad.push(`onset=0 does not restore the instant rise (${Math.min(...off)} ms)`);
  // Mid-word transitions must NOT be ramped: there is no silence there to ease out of, and
  // softening them would smear every consonant in the phrase.
  const v = { ...P.defaultVoice(), ...V, wgap: 0.14 };
  const { buf } = H.say(r.ph, { D: Math.max(0.8, r.ph.length*v.per), voice: v, n, stress: r.stress });
  if (H.rms(buf, 0.500, 0.520) < H.rms(buf, 0.600, 0.620)*0.5)
    bad.push("a mid-word transition got ramped too");

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `half amplitude in ${on.join("/")} ms, ${off.join("/")} with onset nulled` };
});

// ── the tract may not teleport ─────────────────────────────────────────────
check("no keyframe pair asks the tract to move in zero time", () => {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js"), bad = [];
  // Two keyframes can legitimately share an instant — a pause emits one as it ends and the
  // next sound emits one as it begins. What they may not do is DISAGREE, because the
  // interpolation has no time to get from one to the other and the tract simply teleports.
  //
  // It did, by 41 units, after every diphthong followed by a word boundary. `baseFor` returns
  // a diphthong's FIRST posture — /ɑ/ for /aɪ/ — which is right everywhere except here, where
  // the tract has just finished travelling to the SECOND one. "Hold the previous shape" threw
  // it back to the start. That was the pop: two of them in "I love my daughter", at 310 ms and
  // 1283 ms, after "I" and after "my", both /aɪ/.
  //
  // Found because "I lovemy daughter" removes the second one — that spelling puts a plain /i/
  // before the boundary instead of a diphthong, so there is nothing to snap back from.
  const v = { ...P.defaultVoice(), ...P.VOICES.john.v };
  const n = Math.round(v.sect);
  for (const t of ["I love my daughter", "hello world", "how now brown cow",
                   "my wife is great", "the quick brown fox jumps over the lazy dog"]) {
    const r = S.g2p(t);
    const W = P.buildWord(r.ph, { D: Math.max(0.8, r.ph.length*v.per), n, stress: r.stress,
                                  pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    for (let i = 1; i < W.keys.length; i++) {
      if (Math.abs(W.keys[i].t - W.keys[i-1].t) > 1e-9) continue;
      let jump = 0;
      for (let k = 0; k < n; k++) jump += Math.abs(W.keys[i].d[k] - W.keys[i-1].d[k]);
      if (jump > 0.01)
        bad.push(`"${t}" jumps ${jump.toFixed(1)} at ${(W.keys[i].t*1000).toFixed(0)}ms`);
    }
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.slice(0,3).join("  ")
               : "5 phrases, every co-timed keyframe pair agrees" };
});

// ── articulators have mass ─────────────────────────────────────────────────
const ARTIC = ["jaw","bodyPos","bodyHi","tipPos","tipHi","lip"];
function articSpeeds() {
  const P = H.P, S = require(__dirname + "/../engine/spelling.js");
  const v = { ...P.defaultVoice(), ...P.VOICES.john.v }, n = Math.round(v.sect);
  const worst = {}, where = {};
  ARTIC.forEach(k => worst[k] = 0);
  for (const t of ["I love my daughter", "hello world", "how now brown cow", "my wife is great",
                   "the quick brown fox jumps over the lazy dog", "banana and a tomato"]) {
    const r = S.g2p(t);
    const W = P.buildWord(r.ph, { D: Math.max(0.8, r.ph.length*v.per), n, stress: r.stress,
                                  pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    for (let i = 1; i < W.art.length; i++) {
      const dt = W.art[i].t - W.art[i-1].t;
      for (const k of ARTIC) {
        const d = Math.abs(W.art[i].A[k] - W.art[i-1].A[k]);
        const sp = dt < 1e-9 ? (d > 1e-9 ? Infinity : 0) : d/dt;
        if (sp > worst[k]) { worst[k] = sp; where[k] = `${t} @${(W.art[i].t*1000).toFixed(0)}ms`; }
      }
    }
  }
  return { worst, where };
}

check("no articulator is asked to move impossibly fast", () => {
  // A tongue has mass. The model does not know that, and until the diphthong fix it would
  // cheerfully command an INFINITE velocity — 41 units of tract shape in zero time, which is
  // what the pop turned out to be. This is the general form of that bug: not "are two
  // keyframes equal" but "is the motion between them something an anatomy could perform".
  //
  // The bound here is deliberately loose — 200 range-lengths per second, a full sweep in 5 ms.
  // Nothing anatomical is anywhere near it. It is set to catch a FAULT (a teleport, a
  // degenerate interval, a keyframe out of order), not to enforce plausibility, because the
  // model is currently 5-7x faster than muscle everywhere and that is a Phase 9 limitation
  // rather than a bug. The plausibility figures are reported separately, below.
  const { worst, where } = articSpeeds();
  const bad = [];
  for (const k of ARTIC)
    if (!(worst[k] < 200)) bad.push(`${k} ${worst[k] === Infinity ? "instantly" : worst[k].toFixed(0)+"/s"} — ${where[k]}`);

  // AND THE DIAMETERS, which is what the engine actually interpolates. The first version of
  // this check watched only the six articulator parameters — and `art` is emitted by buildWord
  // and IGNORED by the worklet, so it missed the very teleport it was written to generalise.
  // Reintroducing the diphthong bug in the diameter line left `art` perfectly well behaved and
  // the check green. Watching a representation the engine does not use is not watching.
  //
  // That gap is itself the argument for Phase 9: the two representations can disagree because
  // nothing makes them agree.
  const P = H.P, S = require(__dirname + "/../engine/spelling.js");
  const v = { ...P.defaultVoice(), ...P.VOICES.john.v }, n = Math.round(v.sect);
  let dWorst = 0, dWhere = "";
  for (const t of ["I love my daughter", "hello world", "how now brown cow",
                   "the quick brown fox jumps over the lazy dog"]) {
    const r = S.g2p(t);
    const W = P.buildWord(r.ph, { D: Math.max(0.8, r.ph.length*v.per), n, stress: r.stress,
                                  pros: v, glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    for (let i = 1; i < W.keys.length; i++) {
      const dt = W.keys[i].t - W.keys[i-1].t;
      let d = 0;
      for (let k = 0; k < n; k++) d += Math.abs(W.keys[i].d[k] - W.keys[i-1].d[k]);
      const sp = dt < 1e-9 ? (d > 0.01 ? Infinity : 0) : d/dt;
      if (sp > dWorst) { dWorst = sp; dWhere = `${t} @${(W.keys[i].t*1000).toFixed(0)}ms`; }
    }
  }
  // Legitimate transitions peak around 1100 units/s. 20000 is a full tract reshape in 2 ms.
  if (!(dWorst < 20000))
    bad.push(`tract shape ${dWorst === Infinity ? "teleports" : dWorst.toFixed(0)+"/s"} — ${dWhere}`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `articulators ${Math.max(...ARTIC.map(k => worst[k])).toFixed(0)}/s, tract shape ${dWorst.toFixed(0)}/s` };
});

report("how far the articulators are from real anatomy", () => {
  // Measured against how long a real articulator needs to cross its own range: a jaw or a
  // tongue body about 150-200 ms, a tongue tip about 100 ms, lips about 120 ms. These are
  // order-of-magnitude figures from articulography, not precise limits, which is exactly why
  // this reports rather than blocks.
  //
  // This is the quantitative case for Phase 9. Interpolating in articulatory space with
  // per-articulator time constants would make these numbers a consequence of the model rather
  // than an accident of how long a segment happened to be.
  const WANT = { jaw: 0.170, bodyPos: 0.170, bodyHi: 0.170, tipPos: 0.100, tipHi: 0.100, lip: 0.120 };
  const { worst } = articSpeeds();
  const rows = ARTIC.map(k => {
    const ms = 1000/Math.max(1e-9, worst[k]);
    return `${k} ${ms.toFixed(0)}ms(${(WANT[k]*1000/Math.max(1,ms)).toFixed(1)}x)`;
  });
  const over = ARTIC.filter(k => 1000/Math.max(1e-9, worst[k]) < WANT[k]*1000).length;
  return { ok: over === 0,
           note: `${over}/6 faster than anatomy — ${rows.join("  ")}` };
});

check("no word clicks", () => {
  // A stop release is a transient, but an outlier far above the signal's own motion is a
  // click. The white-noise burst once measured 13.5x.
  // A click is a transient AT A STOP RELEASE. Fricatives legitimately have more
  // sample-to-sample motion than vowels, so comparing /s/ against a vowel flags noise that
  // is supposed to be there. Look only where releases happen, and reference a held vowel.
  let worst = 0, which = "", when = 0;
  for (const w of WORDS) {
    const { buf, seg } = H.say(w, { extra: 0.15 });
    const vowels = seg.filter(s => !H.P.STOP_KEYS.includes(s.sym) && !H.P.FRICATIVE[s.sym]);
    if (!vowels.length) continue;
    const ref = vowels.sort((a,b)=>(b.b-b.a)-(a.b-a.a))[0];
    const j = [];
    for (let i = Math.floor(ref.a*H.SR)+1; i < Math.floor(ref.b*H.SR); i++) j.push(Math.abs(buf[i]-buf[i-1]));
    j.sort((a,b)=>a-b);
    const norm = j[Math.floor(j.length*0.98)] || 1e-9;
    for (const s of seg) {
      if (!H.P.STOP_KEYS.includes(s.sym)) continue;
      const a = Math.floor(s.b*H.SR), b = Math.floor((s.b+0.05)*H.SR);   // the release window
      // Level is the honest measure. A release is SUPPOSED to be a sharp transient; it is
      // only a click when it also overshoots the vowel it introduces.
      let vp = 0;
      for (let i = Math.floor(ref.a*H.SR); i < Math.floor(ref.b*H.SR); i++) vp = Math.max(vp, Math.abs(buf[i]));
      let pk = 0;
      for (let i = Math.max(1,a); i < Math.min(buf.length, b); i++) pk = Math.max(pk, Math.abs(buf[i]));
      const over = pk/vp*100;
      if (over > worst) { worst = over; which = w.join("") + " /" + s.sym + "/"; when = s.b; }
    }
  }
  // Band calibrated against a deliberately clicky build, not a guess: with the burst forced
  // to 1.3 the same words reach ~380%. A real /d/ or /t/ release is a genuinely sharp,
  // high-peak event, so anything under ~220% is dynamics rather than a defect.
  return { ok: worst < 220, note: `loudest release ${worst.toFixed(0)}% of vowel on "${which}"` };
});

check("nothing sounds after a word ends", () => {
  // Frication was once ungated and hissed forever after any word ending in /s/.
  let worst = 0, which = "";
  for (const w of WORDS) {
    const { buf, end } = H.say(w, { extra: 1.0 });
    const tail = H.rms(buf, end + 0.35, end + 0.9);
    if (tail > worst) { worst = tail; which = w.join(""); }
  }
  return { ok: worst < 0.002, note: `loudest tail ${worst.toFixed(5)} on "${which}"` };
});

check("every sound in a word is audible", () => {
  // Stops are silent by design; everything else must actually sound. A tail fade once ate
  // final consonants, and gating frication on voicing once silenced every fricative.
  const silent = [];
  for (const w of WORDS) {
    const { buf, seg } = H.say(w);
    for (const s of seg) {
      if (H.P.STOP_KEYS.includes(s.sym)) continue;
      if (H.rms(buf, s.a, s.b) < 0.004) silent.push(`${w.join("")}:${s.sym}`);
    }
  }
  return { ok: silent.length === 0, note: silent.length ? "silent: " + silent.join(" ") : "all sounding" };
});

check("output stays finite and unclipped", () => {
  const bad = [];
  for (const w of WORDS) {
    const { buf } = H.say(w);
    let hot = 0;
    for (let i = 0; i < buf.length; i++) {
      if (!Number.isFinite(buf[i])) { bad.push(w.join("") + ":NaN"); break; }
      if (Math.abs(buf[i]) > 0.999) hot++;
    }
    if (hot > 40) bad.push(`${w.join("")}:${hot} clipped`);
  }
  return { ok: bad.length === 0, note: bad.length ? bad.join(" ") : "clean" };
});

check("a word boundary is a transition, and a real pause is silent", () => {
  // This used to assert that a boundary is SILENT with movement in it. Half of that was
  // wrong: real connected speech does not stop between words, and inserting 90-300 ms of
  // digital silence at every space is what made each word begin from nothing — measured at
  // 6e-12 before the /l/ of "love" against 2e-2 with the boundaries closed up. The movement
  // half was always right and is kept.
  const P = H.P, bad = [];
  const chain = ["h", "eɪ", " ", "d", "ɑ", "d"];
  const trav = (wgap) => {
    const v = { ...P.defaultVoice(), wgap };
    const plan = H.plan(chain, 1.5, v, 44);
    const pz = plan.seg.find(g => g.sym === " ");
    const p = H.makeProcessor(44);
    p.port.onmessage({ data: { type: "voice", v } });
    p.port.onmessage({ data: { type: "goal",
      seq: { keys: plan.keys, f0: [[0, v.f0a], [plan.end, v.f0c]], end: plan.end } } });
    const out = [new Float32Array(128)];
    let first = null, last = null, loud = 0, cnt = 0;
    for (let b = 0; b*128 < H.SR*(plan.end + 0.2); b++) {
      p.process([], [out]);
      const t = b*128/H.SR;
      if (pz && t >= pz.a && t <= pz.b) {
        let mn = 9, mi = 0;
        for (let i = 1; i < 43; i++) if (p.diam[i] < mn) { mn = p.diam[i]; mi = i; }
        if (first === null) first = mi;
        last = mi;
        for (let k = 0; k < 128; k++) { loud += out[0][k]*out[0][k]; cnt++; }
      }
    }
    return { moved: first === null ? 0 : Math.abs(last - first),
             rms: Math.sqrt(loud/Math.max(1,cnt)) };
  };
  // 1. At the default, the boundary is a TRANSITION: the tract travels and the voice keeps going.
  const a = trav(P.VOICE_SPEC.find(x => x.k === "wgap").d);
  if (a.moved < 2) bad.push(`boundary: constriction travelled ${a.moved} sections`);
  if (a.rms < 0.002) bad.push(`boundary is silent (${a.rms.toFixed(5)}) — it should be spoken through`);
  // 2. A REAL pause still silences. The machinery has to survive for when punctuation reaches
  //    the speller, which is what 8.4 step 4 is blocked on.
  const b2 = trav(0.20);
  if (b2.rms > 0.005) bad.push(`a 200 ms pause is not silent (${b2.rms.toFixed(5)})`);
  if (b2.moved < 2) bad.push(`during a real pause the tract stopped moving (${b2.moved})`);

  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `boundary ${a.rms.toFixed(4)} loud and travels ${a.moved}; a 200 ms pause ${b2.rms.toFixed(5)}, travels ${b2.moved}` };
});

check("the glottis moves with the folds", () => {
  // Source-tract interaction: the glottal reflection must FOLLOW the glottal area — near
  // total when the folds close, much less when they are open. A fixed value means the folds
  // are not being loaded by the tract at all. And when abducted for a voiceless sound the
  // glottis is WIDE OPEN, not shut — getting that backwards turned it into a mirror.
  const P = H.makeProcessor(44);
  P.port.onmessage({ data: { type: "voice", v: H.P.defaultVoice() } });
  P.port.onmessage({ data: { type: "shape", diam: H.P.articulate(H.P.ART["ɑ"], 44),
                             br:0, nz:0, fr:0, vl:0, as:0, snap:true } });
  P.voicing = 1; P.vAmp = 1; P.flow = 1; P.flowT = 1; P.f0 = 110;
  const out = [new Float32Array(128)];
  for (let b = 0; b < 200; b++) P.process([], [out]);
  let lo = 9, hi = -9;
  for (let b = 0; b < 40; b++) {
    P.process([], [out]);
    lo = Math.min(lo, P.glotNow); hi = Math.max(hi, P.glotNow);
  }
  // and the voiceless case: folds apart means a LOW reflection
  P.voiceless = 1;
  for (let b = 0; b < 40; b++) P.process([], [out]);
  const vlR = P.glotNow;
  // The test is relative, not a magic number: abducted folds must be at least as open as
  // the widest point of the phonatory cycle, which means a LOWER reflection than `lo`.
  return { ok: (hi - lo) > 0.05 && vlR < lo,
           note: `voiced ${lo.toFixed(2)}-${hi.toFixed(2)}, abducted ${vlR.toFixed(2)}` };
});

// ── the voice ──────────────────────────────────────────────────────────────
check("Rd spans breathy to pressed", () => {
  const h1h2 = (rd) => {
    const x = H.sustain("ə", { seconds: 1.0, voice: { rd, press: 0 }, f0: 120 });
    const st = Math.floor(x.length*0.5), L = 8192;
    const amp = (h) => {
      let re = 0, im = 0;
      for (let i = 0; i < L; i++) {
        const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/L), a = 2*Math.PI*h*120*i/H.SR;
        re += x[st+i]*w*Math.cos(a); im -= x[st+i]*w*Math.sin(a);
      }
      return 20*Math.log10(Math.hypot(re, im)/L + 1e-12);
    };
    return amp(1) - amp(2);
  };
  const pressed = h1h2(0.4), breathy = h1h2(2.2);
  return { ok: breathy - pressed > 8 && pressed < 3,
           note: `H1-H2 ${pressed.toFixed(1)} dB pressed -> ${breathy.toFixed(1)} dB breathy` };
});

check("the two-mass folds oscillate and follow pitch", () => {
  // An oscillator, not a waveform: it vibrates because the physics makes it. Pitch must
  // follow tension, and it must actually start.
  const bad = [];
  for (const f0 of [95, 140, 200]) {
    const x = H.sustain("ɑ", { n: 44, seconds: 0.9, f0,
                               voice: { ...H.P.defaultVoice(), folds: 1, press: 0.35 } });
    let e = 0;
    for (let i = Math.floor(x.length*0.5); i < x.length; i++) e += x[i]*x[i];
    if (Math.sqrt(e / (x.length*0.5)) < 0.004) { bad.push(`${f0}Hz silent`); continue; }
    const st = Math.floor(x.length*0.55);
    let best = 0, bl = 0;
    for (let lag = Math.floor(H.SR/400); lag < Math.floor(H.SR/60); lag++) {
      let s2 = 0;
      for (let i = 0; i < 3000; i++) s2 += x[st+i]*x[st+i+lag];
      if (s2 > best) { best = s2; bl = lag; }
    }
    let m = bl ? H.SR/bl : 0;
    while (m > 0 && m < f0*0.7) m *= 2;
    if (Math.abs(m - f0)/f0 > 0.10) bad.push(`${f0}->${m.toFixed(0)}`);
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.join(" ") : "oscillates and tracks pitch at 95, 140 and 200 Hz" };
});

report("the voice is not too cleanly periodic", () => {
  // Harmonic-to-noise ratio: how much energy sits ON the harmonics against between them.
  // A perfectly periodic source puts everything on the harmonics and nothing between, which
  // is the comb-like look of synthesis and a large part of why it sounds robotic. Measured
  // Measured at 38 dB before the fix. Published healthy voices sit around 15-25 dB: Praat's
  // own documentation puts a healthy sustained [a] at about 20, and the clinical literature
  // runs roughly 7-26. Aspiration is what fills the gaps.
  // A CORRECTION, recorded rather than quietly dropped: this check used to cite "a real
  // recording measures 2-5 dB on this". That figure is not a healthy value — 2-5 dB is the
  // hoarse/pathological range — and it was almost certainly our own estimator misreading a
  // room recording rather than a property of the speaker. The band below was never set from
  // it (it is v < 30, which follows the published range), and the aspiration raise in 401c855
  // landed all nine presets at 12-29 dB, inside the human band. So the number was wrong and
  // the work it prompted was still right. It is corrected here so nobody aims at 2-5 next time.
  const hnr = (sig, f0) => {
    let N = 1; while (N*2 <= sig.length) N *= 2; N = Math.min(N, 16384);
    const st = Math.floor((sig.length - N)/2);
    const re = new Float64Array(N/2+1), im = new Float64Array(N/2+1);
    for (let k = 0; k <= N/2; k++) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) {
        const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/N), th = 2*Math.PI*k*i/N;
        a += sig[st+i]*w*Math.cos(th); b -= sig[st+i]*w*Math.sin(th);
      }
      re[k] = a; im[k] = b;
    }
    const S = k => re[k]*re[k] + im[k]*im[k], bin = f => Math.round(f/H.SR*N);
    let h = 0, nz = 0;
    for (let k = 1; k*f0 < 5000; k++) {
      const c = k*f0;
      for (let b = bin(c-f0*0.18); b <= bin(c+f0*0.18); b++) if (b > 0 && b <= N/2) h += S(b);
      for (let b = bin(c+f0*0.28); b <= bin(c+f0*0.72); b++) if (b > 0 && b <= N/2) nz += S(b);
    }
    return 10*Math.log10(h/Math.max(nz, 1e-12));
  };
  const x = H.sustain("ɑ", { n: 44, seconds: 1.2, f0: 100 });
  const v = hnr(x.subarray(Math.floor(x.length*0.4)), 100);
  return { ok: v < 30, note: `${v.toFixed(1)} dB (healthy voices 15-25; 38 was ours before aspiration)` };
});

check("every voice speaks at its own tract length", () => {
  // The worklet changes tract length ONLY on a {type:'tract'} message — a 'voice' message
  // does not resize it. Build keyframes at one length, run the processor at another, and the
  // tail of every diameter array reads undefined: the output goes NaN, which plays as
  // SILENCE rather than throwing. lab/bench.html shipped exactly this and looked merely
  // unresponsive — nothing in the console, every control apparently dead. harness.js has
  // carried a comment warning about it since the day it cost an afternoon.
  const V = H.P.VOICES, word = ["ɑ","g","ɑ","l"], bad = [];
  const names = VOICES_UNDER_TEST
    ? VOICES_UNDER_TEST.filter(n => V[n])
    : Object.keys(V);
  let quietest = Infinity, quietName = "";
  for (const name of names) {
    const voice = { ...V[name].v };
    const n = Math.round(voice.sect || 44);
    const { keys } = H.plan(word, 0.9, voice, n);
    const wrong = keys.filter(k => k.d.length !== n).length;
    if (wrong) { bad.push(`${name}: ${wrong} keyframes ≠ ${n} sections`); continue; }
    const { buf } = H.say(word, { voice, n });
    let pk = 0, nan = 0;
    for (let i = 0; i < buf.length; i++) {
      if (!Number.isFinite(buf[i])) { nan++; break; }
      const a = Math.abs(buf[i]); if (a > pk) pk = a;
    }
    // Calibrated, not guessed: forcing keyframes of 40 into a 44-section processor gives
    // 67072 NaN samples and a peak of exactly 0, while the quietest healthy
    // preset peaks between 0.055 and 0.08 depending on where the jitter lands. 1e-3 has
    // ~55x headroom either way, so this one does not need averaging to be stable.
    if (nan) bad.push(`${name}: NaN`);
    else if (pk < 1e-3) bad.push(`${name}: silent (${pk.toExponential(1)})`);
    if (pk < quietest) { quietest = pk; quietName = name; }
  }
  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `${names.join("+")} — keyframes match the tract, quietest /${quietName}/ ${quietest.toFixed(4)}${VOICES_UNDER_TEST ? "  (HOLLER_ALL=1 for all " + Object.keys(V).length + ")" : ""}` };
});

check("voiceless stops are aspirated", () => {
  // English stop voicing lives almost entirely in the gap between the burst and the return
  // of the folds: ~58/70/80 ms labial/alveolar/velar for /p t k/ against ~10 for /b d g/.
  // The keyframe interpolation was handing voicing back at the midpoint of the glide, about
  // 19 ms, which is squarely in the VOICED range — so a blind listener returned p as b, t as
  // d and k as t, all three. Measured on the OUTPUT by periodicity, because an energy
  // threshold is tripped instantly by a loud broadband burst and reports zero every time.
  const V = H.P.VOICES.john.v, n = Math.round(V.sect);
  // WINDOW LENGTH. This probe used L=512, which at 44.1 kHz is 11.6 ms — about ONE pitch
  // period of John's 95 Hz voice. A window that short measures where the glottal pulse
  // happens to fall inside it, not how much voice bar there is: swept across a single steady
  // vowel it returns anywhere from 4.9 to 31, a 6x swing, and it did that identically before
  // and after the change that exposed it. So `ref` below, sampled at one arbitrary instant,
  // was a coin flip, and the check passed or failed on where the midpoint happened to land.
  //
  // This is the third time the rule in ROADMAP's "On flaky checks" has been needed and the
  // first time the random process was not noise but the pulse train itself. Measured ripple
  // across a steady vowel by window length: 512 -> 6.2x, 1024 -> 1.29x, 1536 -> 1.05x,
  // 2048 -> 1.05x, 3072 -> 1.25x (it rises again as the window outgrows the steady part).
  // 1536 is 35 ms, 3.3 periods, and it is flat.
  const L_WIN = 1536;
  const lowband = (buf, i, L = L_WIN) => {        // the voice bar, 60-350 Hz
    let s = 0;
    for (let f = 60; f <= 350; f += 25) {
      let r = 0, m = 0;
      for (let j = 0; j < L; j++) {
        const w = 0.5 - 0.5*Math.cos(2*Math.PI*j/L), a = 2*Math.PI*f*j/H.SR;
        r += (buf[i+j]||0)*w*Math.cos(a); m -= (buf[i+j]||0)*w*Math.sin(a);
      }
      s += r*r + m*m;
    }
    return s/(L*L);                               // normalised, so the window length is free
  };
  const vot = {};
  for (const c of ["b","p","d","t","g","k"]) {
    const { buf, seg } = H.say(["ɑ", c, "ɑ"], { D: 0.9, voice: V, n });
    const s = seg.find(x => x.sym === c), v2 = seg[2];
    // MEDIAN over the steady part of the vowel, not one sample of it. Taking a single
    // instant is what made this flaky; taking the middle of a sorted set is immune both to
    // where the pulse lands and to how long the vowel happens to be.
    const r = [];
    for (let t = v2.a + 0.05; t < v2.b - 0.06; t += 0.01) r.push(lowband(buf, Math.floor(t*H.SR)));
    r.sort((a, b) => a - b);
    const ref = r[r.length >> 1];
    const from = Math.floor(s.b*H.SR), step = Math.floor(H.SR*0.005);
    // The bar must be SUSTAINED. A single-frame threshold is tripped by the burst itself,
    // which is loud and broadband, and duly reported 0 ms for every stop in the inventory.
    let run = 0, on = from + Math.floor(H.SR*0.25);
    for (let i = from; i < from + Math.floor(H.SR*0.25); i += step) {
      if (lowband(buf, i) > ref*0.45) { if (++run >= 4) { on = i - 3*step; break; } }
      else run = 0;
    }
    vot[c] = (on - from)/H.SR*1000;
  }
  // Recalibrated against the same ablation the original used — HOLLER_PATCH deleting the VOT
  // line — because fixing the window changed what `ref` is worth and therefore what fraction
  // of it means "voiced again". At 0.45:
  //
  //     VOT present   voiced b10 d0-10 g0-10   voiceless p65 t70-75 k95
  //     VOT ablated   voiced b10 d0    g0      voiceless p35 t35    k35
  //
  // The voiceless cluster collapses to 35 ms when the line is removed, which is the empty gap
  // the original bands were drawn around — so THE BANDS DO NOT MOVE. 35/50 still separates,
  // now with 25 ms of margin below and 15 above instead of passing by luck. Five consecutive
  // runs agree, per the flaky-check rule, and they agree with the duration weighting both on
  // and off — which is how it was established that Phase 8.1 does not touch VOT.
  const bad = [];
  for (const c of ["b","d","g"]) if (vot[c] > 35) bad.push(`${c} ${vot[c].toFixed(0)}ms (voiced, want <35)`);
  for (const c of ["p","t","k"]) if (vot[c] < 50) bad.push(`${c} ${vot[c].toFixed(0)}ms (voiceless, want >50)`);
  return { ok: bad.length === 0,
           note: bad.length ? bad.join("  ")
               : `b${vot.b.toFixed(0)} d${vot.d.toFixed(0)} g${vot.g.toFixed(0)} vs p${vot.p.toFixed(0)} t${vot.t.toFixed(0)} k${vot.k.toFixed(0)} ms` };
});

// ── the runner ─────────────────────────────────────────────────────────────
// The gate gates correctness. It should not gate iteration. Three things follow:
//   a subset can be run while working   node lab/check.js stops
//   results appear as they finish       (they used to print only after all 22)
//   independent checks use idle cores   HOLLER_JOBS=n, defaults to the core count
// The FULL gate is still what ships:  ./lab/ship.sh runs it with no filter, and a filtered
// run says so loudly in its verdict so a partial pass can never be mistaken for a green gate.
const os = require("os");
const { isMainThread, parentPort, workerData, Worker } = require("worker_threads");

// Renders are deterministic now, which is what makes a green run mean something — but it also
// means a check could be passing on ONE seed. HOLLER_SEEDS=k re-runs each check across k seeds
// and requires them all to agree. That is the "five consecutive runs" rule from the roadmap,
// made cheap, explicit and opt-in instead of a thing you remember to do by hand.
const SEEDS = Math.max(1, parseInt(process.env.HOLLER_SEEDS || "1", 10) || 1);

function runOne(i) {
  const c = REG[i], t0 = Date.now();
  let ok = false, note = "";
  try {
    if (SEEDS === 1) { const r = c.fn(); ok = r.ok; note = r.note; }
    else {
      const rs = [];
      for (let k = 0; k < SEEDS; k++) { H.setSeed(H.BASE_SEED + k); rs.push(c.fn()); }
      H.setSeed(H.BASE_SEED);
      ok = rs.every(r => r.ok);
      const bad = rs.filter(r => !r.ok).length;
      note = ok ? `${SEEDS} seeds agree · ${rs[0].note}`
                : `UNSTABLE across seeds (${bad}/${SEEDS} failed) · ${rs.find(r => !r.ok).note}`;
    }
  }
  catch (e) { ok = false; note = "threw: " + e.message; }
  return { i, name: c.name, ok, note, ms: Date.now() - t0, tier: c.tier };
}

if (!isMainThread && workerData && workerData.idx) {
  // Report each result the moment it lands. Posting the whole slice at the end would put the
  // streaming property back where it started — nothing visible until a worker is completely
  // done — which is the thing this runner exists to fix.
  for (const i of workerData.idx) parentPort.postMessage([runOne(i)]);
} else {
  const args  = process.argv.slice(2).filter(a => a !== "--list" && a !== "--report");
  const query = (process.env.HOLLER_ONLY || args.join(" ")).trim().toLowerCase();
  const terms = query ? query.split(/[,\s]+/).filter(Boolean) : [];
  const wantReport = process.argv.includes("--report") || !!process.env.HOLLER_REPORT;
  const idx = REG.map((_, i) => i)
                 .filter(i => wantReport || REG[i].tier === "gate")
                 .filter(i => !terms.length || terms.some(t => REG[i].name.toLowerCase().includes(t)));

  if (process.argv.includes("--list")) {
    REG.forEach((c, i) => console.log(`  ${String(i).padStart(2)}  ${c.tier === "gate" ? "gate  " : "report"}  ${c.name}`));
    process.exit(0);
  }
  if (!idx.length) {
    console.log(`\nno check matches "${query}" — run with --list to see the names\n`);
    process.exit(2);
  }

  const bail = !!process.env.HOLLER_BAIL;
  const jobs = Math.max(1, Math.min(
    parseInt(process.env.HOLLER_JOBS || "", 10) || os.cpus().length, idx.length));
  const t0 = Date.now();
  const done = [];

  console.log(`\nHOLLERBOX — ${wantReport ? "gate + report" : "gate"}   ${idx.length}/${REG.length}` +
              `${terms.length ? ` matching "${query}"` : ""}` +
              `${jobs > 1 && !bail ? `, ${jobs} jobs` : ""}\n`);

  const line = r => console.log(`  ${r.tier === "report" ? (r.ok ? "  ·" : "  ⚠") : (r.ok ? "  ✅" : "  ❌")} ${r.name.padEnd(42)} ${String(r.note).padEnd(46)} ${(r.ms/1000).toFixed(1)}s`);

  const verdict = () => {
    done.sort((a, b) => a.i - b.i);
    // Only the gate tier can fail the build. A report line that has moved is information.
    const failed = done.filter(r => !r.ok && r.tier === "gate");
    const drifted = done.filter(r => !r.ok && r.tier === "report");
    const gateTotal = REG.filter(c => c.tier === "gate").length;
    const partial = done.filter(r => r.tier === "gate").length !== gateTotal;
    if (drifted.length)
      console.log(`\n  ⚠ ${drifted.length} report measurement${drifted.length>1?"s":""} outside the last recorded range — information, not a failure`);
    console.log(failed.length
      ? `\n🔴 ${failed.length} failing   (${((Date.now()-t0)/1000).toFixed(0)}s)\n`
      : partial
        ? `\n🟡 ${done.length} passed, but this was a SUBSET — not a green gate. Run the full gate before pushing.   (${((Date.now()-t0)/1000).toFixed(0)}s)\n`
        : `\n🟢 all clear   (${((Date.now()-t0)/1000).toFixed(0)}s)\n`);
    process.exit(failed.length ? 1 : 0);
  };

  // Sequential when asked to stop at the first failure, or when there is one core to use.
  if (jobs === 1 || bail) {
    for (const i of idx) {
      const r = runOne(i); done.push(r); line(r);
      if (!r.ok && bail) { console.log("\n🔴 stopped at first failure (HOLLER_BAIL)\n"); process.exit(1); }
    }
    verdict();
  } else {
    // Deal the checks round-robin so one slow check does not leave a core idle at the end.
    const slices = Array.from({ length: jobs }, () => []);
    idx.forEach((c, k) => slices[k % jobs].push(c));
    let live = 0;
    slices.filter(s => s.length).forEach(slice => {
      live++;
      const w = new Worker(__filename, { workerData: { idx: slice } });
      w.on("message", rs => { rs.forEach(r => { done.push(r); line(r); }); });
      w.on("error", e => { slice.forEach(i => done.push({ i, name: REG[i].name, ok: false, note: "worker died: " + e.message, ms: 0 })); });
      w.on("exit", () => { if (--live === 0) verdict(); });
    });
  }
}
