// A `voice` message does not resize the tract; only a `tract` message does. Build keyframes for
// one length and play them on another and the tail of every frame is undefined — NaN, and silence
// or noise rather than a crash.
//
// This has now bitten twice, in two pages, for two different reasons. The wizard changed `sect`
// in its first question and tracked its own N. index.html let startAudio choose the length from
// the DEVICE SAMPLE RATE — 44 sections at 44.1 kHz and 48 at 48 — and then went on building at
// its own 44. On a 48 kHz device the opening line was 230,656 non-finite samples until something
// resized it, which is why it played wrong once and correctly afterwards.
check("no page builds keyframes for a tract it does not have", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");

  // every page that owns a worklet must get its length from the guard rather than from a local
  for (const p of ["index.html", "wizard.html"]) {
    const t = fs.readFileSync(path.join(root, p), "utf8");
    if (!/tractFor\(/.test(t)) bad.push(`${p} does not use tractFor`);
    // and must not post a raw resize of its own, which is how the two got out of step
    if (/postMessage\(\{\s*type:\s*'tract'/.test(t))
      bad.push(`${p} posts its own tract message instead of going through the guard`);
  }

  // and the consequence, measured: a mismatch is not a subtle degradation
  const P = H.P, S = require("../../engine/spelling.js");
  const v = { ...P.defaultVoice(), ...P.VOICES.man.v };
  const r = S.g2p("hello world");
  const D = Math.max(0.35, r.ph.length * (v.per || 0.17));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n: 44, stress: r.stress, pros: v,
                        glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
  const p2 = H.makeProcessor(48);
  p2.port.onmessage({ data: { type: "voice", v } });
  p2.port.onmessage({ data: { type: "goal",
    seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
  const out = [new Float32Array(128)];
  let nan = 0;
  for (let b = 0; b < Math.ceil(W.end * H.SR / 128); b++) {
    p2.process([], [out]);
    for (let i = 0; i < 128; i++) if (!Number.isFinite(out[0][i])) nan++;
  }
  if (nan === 0) bad.push("a 44-built word on a 48 tract is now harmless — this check is measuring nothing");

  return { ok: bad.length === 0,
           note: bad.join("  ") || `both pages go through the guard; a mismatch still produces ${nan} NaN samples` };
});
