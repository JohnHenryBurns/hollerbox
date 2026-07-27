// The wizard kept going silent when nudged, after four separate fixes to the PAGE. This one is
// the engine, and it is the one that was actually causing it.
//
// A sequence in flight is built for a particular section count. Resize the tract underneath it
// and the tail of every keyframe is undefined — measured, a resize landing mid-word produces
// 5,120 non-finite samples, and the voice stops until something starts a new one.
//
// That is reachable from the wizard BY DESIGN: nudging the size question changes `sect`, the page
// sends the resize, and the word already playing has not finished. The page cannot avoid it —
// the resize has to happen and the old word has to stop — so the engine drops what it can no
// longer render rather than rendering it wrongly.
check("a tract resize does not poison the word already playing", () => {
  const P = H.P, S = require("../../engine/spelling.js"), bad = [];
  const p = H.makeProcessor(44);
  p.port.postMessage = () => {};
  const out = [new Float32Array(128)];

  const start = sect => {
    const v = { ...P.defaultVoice(), sect }, n = Math.round(sect);
    const r = S.g2p("hello world");
    const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
    const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                                  glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
    p.port.onmessage({ data: { type: "tract", n, diam: P.articulate(P.ART["ə"], n) } });
    p.port.onmessage({ data: { type: "voice", v } });
    p.port.onmessage({ data: { type: "goal",
      seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
  };
  const run = blocks => {
    let nan = 0, pk = 0;
    for (let b = 0; b < blocks; b++) {
      p.process([], [out]);
      for (let i = 0; i < 128; i++) {
        const x = out[0][i];
        if (!Number.isFinite(x)) nan++; else pk = Math.max(pk, Math.abs(x));
      }
    }
    return { nan, pk };
  };

  // the exact sequence a nudge produces: playing, then resized, then a new word
  start(44); run(40);
  p.port.onmessage({ data: { type: "tract", n: 52, diam: P.articulate(P.ART["ə"], 52) } });
  const mid = run(40);
  if (mid.nan) bad.push(`${mid.nan} non-finite samples after a resize mid-word`);
  start(52);
  const after = run(60);
  if (after.nan) bad.push(`${after.nan} non-finite samples in the word after a resize`);
  if (after.pk < 0.02) bad.push("the word after a resize is silent");

  // and a run of them, because the wizard's size question is nudged repeatedly
  let broke = 0;
  for (let i = 0; i < 12; i++) {
    start(26 + (i * 7) % 30);
    run(15);
    if (run(4).nan) broke++;
  }
  if (broke) bad.push(`${broke} of 12 interrupted words went NaN`);

  return { ok: bad.length === 0,
           note: bad.join("  ") || "resize mid-word drops the stale sequence; 12 interruptions clean" };
});
