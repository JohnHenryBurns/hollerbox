// Stop stopped the sound and the tube and left the karaoke and the mouth running — a silent
// throat mouthing the rest of the sentence, which is worse than either stopping or not stopping.
//
// THREE CLOCKS, AND STOP WAS TELLING ONE:
//   the worklet   stopSeq, and the sound ends
//   playSeg       the karaoke's clock — which chip is lit, where the strip sits
//   artTrack      the mouth's clock — where the articulators are drawn
//
// The last two are on their own clocks BY DESIGN and that was the right fix for its own problem:
// the karaoke used to follow the worklet's `sequencing` flag, which arrives late and can arrive
// stale, so a message in flight from the end of one word could blank the chips while the next was
// still being said. Moving the picture onto the plan fixed that and left Stop with no way to say
// the plan is over.
check("stop stops every clock, not just the sound", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const t = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

  const i = t.indexOf("function stopEverything");
  if (i < 0) return { ok: false, note: "no single place that stops everything" };
  const body = t.slice(i, t.indexOf("\n}", i));

  for (const [what, re] of [
    ["the sound",        /stopSeq/],
    ["the karaoke",      /playSeg\s*=\s*null/],
    ["the mouth",        /artTrack\s*=\s*null/],
    ["a queued utterance", /turn\+\+/],
    ["the lit chip now",  /bounceWord\(\)/],
  ]) if (!re.test(body)) bad.push(`stop does not clear ${what}`);

  // and the Play button must route through it rather than doing its own subset
  const btn = t.slice(t.indexOf("playBtn.addEventListener"), t.indexOf("playBtn.addEventListener") + 260);
  if (!/stopEverything\(\)/.test(btn))
    bad.push("the Play button stops things its own way instead of calling stopEverything");

  // the engine's own stop must actually silence it, rather than the page pretending it did
  const P = H.P, S = require("../../engine/spelling.js");
  const v = { ...P.defaultVoice(), ...P.VOICES.john.v }, n = Math.round(v.sect);
  const r = S.g2p("she sells sea shells by the shore");
  const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                                glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
  const p = H.makeProcessor(n);
  p.port.postMessage = () => {};
  p.port.onmessage({ data: { type: "voice", v } });
  p.port.onmessage({ data: { type: "goal",
    seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
  const out = [new Float32Array(128)];
  const total = Math.ceil(W.end * H.SR / 128);
  for (let b = 0; b < Math.floor(total * 0.4); b++) p.process([], [out]);
  p.port.onmessage({ data: { type: "stopSeq" } });
  // 150 ms is generous for a tube to empty and far too short for a word to continue
  let pk = 0;
  for (let b = 0; b < Math.ceil(0.15 * H.SR / 128); b++) {
    p.process([], [out]);
    for (let i2 = 0; i2 < 128; i2++) pk = Math.max(pk, Math.abs(out[0][i2]));
  }
  let after = 0;
  for (let b = 0; b < 40; b++) {
    p.process([], [out]);
    for (let i2 = 0; i2 < 128; i2++) after = Math.max(after, Math.abs(out[0][i2]));
  }
  if (after > 0.002) bad.push(`still sounding ${(1000*40*128/H.SR).toFixed(0)} ms after stop: ${after.toFixed(4)}`);

  return { ok: bad.length === 0,
           note: bad.join("  ") || `four clocks cleared; the tube rings out to ${after.toFixed(5)}` };
});
