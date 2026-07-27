// Two faults with one shape: the page could not find out what the engine was doing.
//
// THE WORKLET POSTED EVERY 512 TICKS — once every 1.49 seconds — and that was the only way the
// page learned anything. So the Play button stayed a Stop button for up to a second and a half
// after a word ended, and a post already in flight could land AFTER the page had optimistically
// started a word, carrying a `seq` from before the goal was received and clearing it — which
// stopped the karaoke dead while the voice carried on.
//
// A picture belongs on a timer. A STATE belongs on its change.
check("speaking state is reported when it changes", () => {
  const P = H.P, S = require("../../engine/spelling.js"), bad = [];
  const v = { ...P.defaultVoice(), ...P.VOICES.man.v }, n = Math.round(v.sect);
  const r = S.g2p("hello world");
  const D = Math.max(0.35, r.ph.length*(v.per||0.17));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                        glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
  const p = H.makeProcessor(n);
  const posts = [];
  p.port.postMessage = m => posts.push(m);
  p.port.onmessage({ data: { type: "voice", v } });
  p.port.onmessage({ data: { type: "goal",
    seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress: r.stress, seg: W.seg }), end: W.end } } });
  const out = [new Float32Array(128)];
  const total = Math.ceil((W.end + 0.6)*H.SR/128);
  const marks = [];
  for (let b = 0; b < total; b++) {
    const before = posts.length;
    p.process([], [out]);
    for (let i = before; i < posts.length; i++)
      if (posts[i].state) marks.push({ t: b*128/H.SR, seq: posts[i].seq });
  }

  const started = marks.find(m => m.seq);
  const ended = marks.find(m => !m.seq && m.t > 0.05);
  if (!started) bad.push("nothing reports the start of a word");
  if (!ended) bad.push("nothing reports the end of a word");
  else {
    // it must arrive when the word ends, not on the next picture tick 1.49 s later
    const late = ended.t - W.end;
    if (Math.abs(late) > 0.05) bad.push(`the end is reported ${late.toFixed(2)}s off the word's end`);
  }
  // and a state message must not carry a picture, or taking it would blank the tube
  for (const m of posts) if (m.state && m.d) bad.push("a state message carries diameters");

  // ── AND THE CONTEXT MUST BE WOKEN ────────────────────────────────────────
  // A browser suspends an AudioContext when its tab is hidden and does not resume it on the way
  // back. Nothing resumed it, so switching tabs and returning left the page silent until reload.
  const fs = require("fs"), path = require("path");
  const sess = fs.readFileSync(path.join(__dirname, "..", "..", "engine", "session.js"), "utf8");
  if (!/visibilitychange/.test(sess)) bad.push("nothing resumes the context when the tab comes back");
  if (!/ctx\.state === 'suspended'/.test(sess)) bad.push("nothing checks whether it is suspended");

  return { ok: bad.length === 0,
           note: bad.join("  ") ||
                 `start at ${started.t.toFixed(2)}s, end at ${ended.t.toFixed(2)}s for a ` +
                 `${W.end.toFixed(2)}s word; the context wakes on return` };
});
