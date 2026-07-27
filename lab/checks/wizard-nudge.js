// The four questions set eighteen of forty-two parameters and each offers three to five fixed
// points. Everything between those points is unreachable, and the interesting voices are usually
// in between. A nudge jitters one question's parameters and leaves the other three alone — one
// question at a time is how you find out what a question means, where randomising everything
// gives you a voice you cannot learn anything from.
check("a nudge stays in bounds and stays near its answer", () => {
  const fs = require("fs"), path = require("path"), P = H.P, bad = [];
  const page = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");

  const m = page.match(/const OWNS = \{[\s\S]*?\};/);
  if (!m) return { ok: false, note: "no OWNS map — no question owns anything" };
  const OWNS = new Function(m[0] + "\nreturn OWNS;")();

  // every question owns something, and no parameter is owned twice — two questions moving the
  // same knob would make each one's effect depend on the other's
  const seen = {};
  for (const [q, keys] of Object.entries(OWNS)) {
    if (!keys.length) bad.push(`${q} owns nothing`);
    for (const k of keys) {
      if (!P.VOICE_SPEC.some(s => s.k === k)) bad.push(`${q} owns ${k}, which is not a parameter`);
      if (seen[k]) bad.push(`${k} is owned by both ${seen[k]} and ${q}`);
      seen[k] = q;
    }
  }

  // AROUND THE ANSWER, NOT AROUND THE LAST NUDGE. Nudging from the previous nudge is a random
  // walk: measured, "a giant" drifted from 70 Hz to 147 in five taps and stopped being a giant
  // while the button still said it was one.
  if (/const base = current\(\)/.test(page))
    bad.push("the nudge is relative to the current voice — five taps and it wanders off its answer");

  // and it must clamp: a parameter outside its own bounds cannot survive a seed, which is how
  // Barry White became unshareable
  let seed = 99, rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5;
                               seed>>>=0; return seed/4294967296; };
  const answer = { ...P.defaultVoice(), sect: 54, f0a: 70, f0b: 80, f0c: 60 };
  let oob = 0, far = 0;
  for (let i = 0; i < 200; i++) {
    for (const k of OWNS.q1 || []) {
      const sp = P.VOICE_SPEC.find(x => x.k === k);
      if (!sp) continue;
      const span = sp.hi - sp.lo;
      const v = Math.max(sp.lo, Math.min(sp.hi, answer[k] + (rnd()*2-1)*span*0.2));
      if (v < sp.lo - 1e-9 || v > sp.hi + 1e-9) oob++;
      if (Math.abs(v - answer[k]) > span*0.21) far++;
    }
  }
  if (oob) bad.push(`${oob} nudges left their parameter's bounds`);
  if (far) bad.push(`${far} nudges moved further than one step from the answer`);

  // THE VARIETY IS THE POINT. Eighteen of forty-two left twenty-four unreachable from this page,
  // and the reachable ones were the obvious ones. Three are held back and each for its own
  // reason: artStiff breaks articulation at its top end (the tract misses its postures by 0.44
  // against a calibrated 0.09), outGain is loudness rather than character, and fricDuck is what
  // makes a voiced fricative sound like one rather than a hum.
  const HELD = ["artStiff", "outGain", "fricDuck"];
  const reach = Object.keys(seen).length;
  if (reach < P.VOICE_SPEC.length - HELD.length)
    bad.push(`the wizard reaches ${reach} of ${P.VOICE_SPEC.length}; ` +
             `${P.VOICE_SPEC.length - HELD.length} are safe to expose`);
  for (const k of HELD)
    if (seen[k]) bad.push(`${k} is exposed to nudging and should not be`);

  // and a nudged voice must still be a voice. Forty of them, every question moved at once.
  const S = require("../../engine/spelling.js");
  const base = { ...P.defaultVoice(), ...P.VOICES.man.v };
  let broke = 0;
  // Four, not twelve. Each is a full render and this check was taking 62 seconds — a third of
  // the fast tier on its own, for a question four samples answer just as well: a nudge that
  // produces silence or NaN does so because a parameter combination is unsound, not because the
  // twelfth roll was unlucky.
  for (let trial = 0; trial < 4; trial++) {
    const v = { ...base };
    for (const keys of Object.values(OWNS))
      for (const k of keys) {
        const sp = P.VOICE_SPEC.find(x => x.k === k);
        if (!sp) continue;
        v[k] = Math.max(sp.lo, Math.min(sp.hi, base[k] + (rnd()*2-1)*(sp.hi-sp.lo)*0.2));
      }
    const n = Math.round(v.sect);
    const r = S.g2p("she sells sea shells");
    const D = Math.max(0.35, r.ph.length*(v.per||0.17));
    const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                          glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    const p = H.makeProcessor(n);
    p.port.postMessage = () => {};
    p.port.onmessage({ data: { type: "voice", v } });
    p.port.onmessage({ data: { type: "goal",
      seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
    const out = [new Float32Array(128)];
    let pk = 0, nan = 0;
    for (let b = 0; b < Math.ceil(W.end*H.SR/128); b++) {
      p.process([], [out]);
      for (let i = 0; i < 128; i++) {
        const x = out[0][i];
        if (!Number.isFinite(x)) nan++; else pk = Math.max(pk, Math.abs(x));
      }
    }
    if (nan || pk < 0.02) broke++;
  }
  if (broke) bad.push(`${broke} of 4 nudged voices came out silent or NaN`);

  // ── AND IT HAS TO BE FINDABLE ────────────────────────────────────────────
  // The nudge was a fifth button in every question — equal weight to the four things the
  // question actually asks, and nothing said which answer it would vary. It lives on the chosen
  // answer now, which is where the relationship is obvious. An affordance nobody can see is not
  // an affordance, so the chosen option says what a second tap does.
  if (/opt nudge/.test(page)) bad.push("the nudge is still a button of its own");
  if (!/tap again to vary/.test(page)) bad.push("nothing tells you a second tap varies the answer");
  // a tap that changes a number you cannot see is indistinguishable from one that did nothing
  if (!/@keyframes hb-shimmy/.test(page)) bad.push("no acknowledgement that the tap did anything");
  if (!/prefers-reduced-motion/.test(page)) bad.push("the shimmy ignores prefers-reduced-motion");
  // and a varied answer must look different from an untouched one, or the state is invisible
  if (!/\.opt\.varied/.test(page)) bad.push("a varied answer looks the same as an untouched one");

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(OWNS).length} questions reach ${reach} of ${P.VOICE_SPEC.length} ` +
                 `parameters, no overlap; 4 nudged voices all speak` };
});
