// The four questions are adjustments, and until now the thing they adjusted was fixed: John,
// invisibly, forever. Somebody who wanted to start from Barry and make him breathier had to leave
// the page, pick Barry on the throat, and come back by link.
check("the wizard can start from any voice, and says which", () => {
  const fs = require("fs"), path = require("path"), P = H.P, bad = [];
  const root = path.join(__dirname, "..", "..");
  const t = fs.readFileSync(path.join(root, "wizard.html"), "utf8");

  if (!/id="voiceBtn"/.test(t)) bad.push("no way to choose a starting voice");
  if (!/voiceMenu\(/.test(t)) bad.push("it does not use the shared voice sheet");
  if (!/id="voiceVal"/.test(t)) bad.push("the control does not say which voice it started from");
  // A NEW STARTING POINT IS A RESET. A nudge count records what you did to the OLD voice; keeping
  // it would claim you had rolled a voice you have never heard.
  if (!/delete tally\[q\.id\]/.test(t)) bad.push("choosing a voice keeps the old tallies");
  if (!/adoptVoice\(\{ \.\.\.HOLLER\.defaultVoice\(\)/.test(t))
    bad.push("choosing a voice does not re-match the questions to it");

  // and it must actually BECOME that voice — the questions rebuild it exactly, not approximately
  const Q = new Function(t.match(/const Q = \[[\s\S]*?\n\];/)[0] + "\nreturn Q;")();
  const OWNS = new Function(t.match(/const OWNS = \{[\s\S]*?\};/)[0] + "\nreturn OWNS;")();
  const BASE = { ...P.defaultVoice(), ...(P.VOICES.john.v || {}) };
  const src = t.match(/function adoptVoice\(v\)\{[\s\S]*?\n\}/);
  if (src) {
    const chosen = {}, nudged = {};
    for (const q of Q) chosen[q.id] = 0;
    const adopt = new Function("Q","OWNS","BASE","HOLLER","chosen","nudged","draw","showSeed",
      src[0] + "\nreturn adoptVoice;")(Q, OWNS, BASE, P, chosen, nudged, () => {}, () => {});
    let worst = 0, worstName = "";
    for (const name of Object.keys(P.VOICES)) {
      if (!P.VOICES[name].v) continue;
      const want = { ...P.defaultVoice(), ...P.VOICES[name].v };
      for (const k of Object.keys(nudged)) delete nudged[k];
      adopt(want);
      let got = { ...BASE };
      for (const q of Q) got = { ...got, ...q.opts[chosen[q.id]][2], ...(nudged[q.id] || {}) };
      for (const sp of P.VOICE_SPEC) {
        const span = (sp.hi - sp.lo) || 1;
        const d = Math.abs((got[sp.k] ?? want[sp.k]) - want[sp.k]) / span;
        if (d > worst) { worst = d; worstName = `${name}.${sp.k}`; }
      }
    }
    if (worst > 0.005)
      bad.push(`starting from ${worstName} lands ${(100*worst).toFixed(1)}% off — it is not that voice`);
  }

  // THE SIZE LADDER RUNS ONE WAY. It is a question about size, so its options must be ordered by
  // size, and the pitch must follow — tract length is what makes a voice a man, a woman or a
  // child, and pitch is a consequence.
  //
  // READ WHAT THIS CANNOT SEE. The ladder used to have a woman in it labelled "a kid", at f0 210
  // against a measured child's 268 — and ABLATED, THIS CHECK PASSES THAT. Putting 210 back leaves
  // the ordering perfectly monotonic, because 210 sits between the mouse's 300 and the woman's
  // 200. Ordering is all this tests.
  //
  // What actually exposed it was adding a woman: two adjacent options ten hertz apart, one
  // claiming to be a child and one a woman. A person can see that and a rule cannot, so the
  // values here are the presets' own measured ones and changing them means measuring again.
  const size = Q.find(q => q.key === "size" || q.id === "q1");
  if (size) {
    let lastSect = -1, lastF0 = 1e9;
    for (const [label, , patch] of size.opts) {
      if (patch.sect === undefined) { bad.push(`size/${label} does not set a tract length`); continue; }
      if (patch.sect <= lastSect) bad.push(`size/${label} is not longer than the option before it`);
      if (patch.f0a !== undefined && patch.f0a >= lastF0)
        bad.push(`size/${label} is not lower-pitched than the option before it`);
      lastSect = patch.sect; if (patch.f0a !== undefined) lastF0 = patch.f0a;
    }
  }

  // THE LIVELINESS LADDER RUNS ONE WAY TOO, and reaches the top. Bouncy sat at acc 6 against
  // Normal's 7 — 13.3 semitones of pitch range against 14.5, so the fourth option was flatter
  // than the third and the question ran backwards in the middle. And Wild reached 15.2 st where
  // the parameters allow 20.7: 73% of what the engine can do, in the option whose whole job is
  // to be the extreme.
  //
  // Measured on the CONTOUR rather than on `acc`, because three parameters move together here
  // and the one that reads highest is not always the one that sounds liveliest.
  const S2 = require("../../engine/spelling.js");
  const life = Q.find(q => q.key === "life" || q.id === "q2");
  if (life) {
    const BASE2 = { ...P.defaultVoice(), ...(P.VOICES.john.v || {}) };
    const range = over => {
      const v = { ...BASE2, ...over };
      const r = S2.g2p("she sells sea shells by the shore");
      const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
      const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n: Math.round(v.sect),
                            stress: r.stress, pros: v, glide: v.glide,
                            stopHold: v.stopT, drawl: v.drawl });
      const hz = P.buildF0(W.end, v, { stress: r.stress, seg: W.seg })
                  .map(x => x.v || x.f || x[1]).filter(x => x > 0);
      if (!hz.length) return 0;
      const st = hz.map(x => 12 * Math.log2(x / hz[0]));
      return Math.max(...st) - Math.min(...st);
    };
    let prev = -1, top = 0;
    for (const [label, , patch] of life.opts) {
      const r = range(patch);
      if (r < prev - 0.2) bad.push(`liveliness/${label} is flatter than the option above it`);
      prev = r; top = r;
    }
    const ceiling = range({ acc: 14, decl: 4, wklev: 0.35 });
    if (top < ceiling * 0.9)
      bad.push(`the liveliest option reaches ${top.toFixed(1)} st of a possible ${ceiling.toFixed(1)}`);
  }

  // AND THE EDGE LADDER RUNS ON CONSONANT PROMINENCE. Split out of "tone", which was two
  // questions wearing one label: measured, these six parameters move the sound 8.22 dB — more
  // than the five that stayed — and not one option in the old question set any of them. They
  // were reachable only by nudging.
  //
  // Ordered on how far the consonants stand out from the vowels, NOT on brightness. High-
  // frequency share was the obvious measure and it is the wrong one — damp, open and burst each
  // move it non-monotonically across their own ranges, and a ladder built on it put Sharp darker
  // than Soft.
  const edge = Q.find(q => q.key === "edge" || q.id === "q5");
  if (edge) {
    const S3 = require("../../engine/spelling.js");
    const B3 = { ...P.defaultVoice(), ...(P.VOICES.john.v || {}) };
    const VOW = "iɪɛæɑɔʊuʌɝəeɪaɪaʊoʊ";
    const prom = over => {
      const v = { ...B3, ...over }, n = Math.round(v.sect);
      const r = S3.g2p("she sells sea shells by the shore");
      const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
      const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                                    glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
      const p2 = H.makeProcessor(n);
      p2.port.postMessage = () => {};
      p2.port.onmessage({ data: { type: "voice", v } });
      p2.port.onmessage({ data: { type: "goal",
        seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
      const o2 = [new Float32Array(128)], buf = [];
      for (let b = 0; b < Math.ceil(W.end * H.SR / 128); b++) { p2.process([], [o2]); buf.push(...o2[0]); }
      const B = Float64Array.from(buf);
      let c = 0, cn = 0, vv = 0, vn = 0;
      for (const sg of W.seg) {
        const sym = String(sg.sym);
        if (sym === " " || sym.slice(0, 3) === "brk") continue;
        const e = H.rms(B, sg.a + 0.005, sg.b - 0.005);
        if (!isFinite(e)) continue;
        if (VOW.includes(sym)) { vv += e; vn++; } else { c += e; cn++; }
      }
      return 20 * Math.log10((c / Math.max(1, cn)) / (vv / Math.max(1, vn)));
    };
    let prev = -99;
    for (const [label, , patch] of edge.opts) {
      const x = prom(patch);
      if (x < prev - 0.3) bad.push(`edge/${label} has quieter consonants than the option above it`);
      prev = x;
    }
  }

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(P.VOICES).filter(k => P.VOICES[k].v).length} starting voices, ` +
                 `each rebuilt exactly by the questions` };
});
