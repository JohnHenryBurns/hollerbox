//
// THE ARTICULATION-ONLY PATH MOVES THE TRACT IDENTICALLY.
//
// `processorOptions.artOnly` skips the source and the scattering so a control model can be fitted
// against the tract's motion without paying for sound. The whole value of that is that it is the
// SAME motion — a fast path computing something subtly different would be the most expensive bug
// available here, because every number downstream would be about a tract nobody has ever heard.
//
// So: bit-identical, not close. The articulation block reads nothing the source block writes, and
// every Math.random() in the engine is downstream of the cut, so there is no reason for a single
// bit to differ and no tolerance is granted.
//
// Gate rather than report: this is an invariant of the two code paths, not a calibration.
//
// The negative control is the important half again. If `artOnly` were ignored — a typo in the
// option name, a flag never read — the two runs would be identical for the boring reason and this
// check would pass while testing nothing. So it also asserts that the fast path emits SILENCE: the
// cut is upstream of the line that writes the sample, so an artOnly run cannot produce audio, and
// a full run of the same word certainly does.
//
// That is deliberately not a timing assertion, and the first version was one: it required the fast
// path to be twice as quick. Run alone it measures 2.1x. Run inside the full gate, sharing cores
// with everything else, it measures 1.5x — so that version would have failed a correct engine on
// its first honest run, and the obvious response would have been to go looking for a bug in the
// engine. Speed is why the flag exists; it is not what makes it correct. Reported, never gated.
//

check("articulation-only moves the tract identically and makes no sound", () => {
  const path = require("path");
  const P = H.P;
  const S = require(path.join(__dirname, "..", "..", "engine", "spelling.js"));
  const v = { ...P.defaultVoice(), ...(P.VOICES.john.v || {}) };
  const n = Math.round(v.sect);

  const r = S.g2p("she sells sea shells");
  const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                                glide: v.glide, stopHold: v.stopT, drawl: v.drawl });
  const f0 = P.buildF0(W.end, v, { stress: r.stress, seg: W.seg });
  const blocks = Math.ceil(W.end * H.SR / 128);

  const run = (artOnly) => {
    H.setSeed(H.BASE_SEED);                 // the full path consumes randomness; the fast one must
    const p = H.makeProcessor(n, { artOnly });   // not be able to inherit a different stream
    p.port.onmessage({ data: { type: "voice", v } });
    p.port.onmessage({ data: { type: "goal", seq: { keys: W.keys, f0, end: W.end } } });
    const out = [new Float32Array(128)];
    const track = [];
    let peak = 0;
    const t0 = process.hrtime.bigint();
    for (let b = 0; b < blocks; b++) {
      p.process([], [out]);
      for (let s = 0; s < 128; s++) peak = Math.max(peak, Math.abs(out[0][s]));
      track.push(Float64Array.from(p.diam.subarray(0, n)));
    }
    return { track, peak, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
  };

  const full = run(false);
  const fast = run(true);

  let diffs = 0, worst = 0, whereB = -1, whereI = -1;
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < n; i++) {
      const d = Math.abs(full.track[b][i] - fast.track[b][i]);
      if (d !== 0) { diffs++; if (d > worst) { worst = d; whereB = b; whereI = i; } }
    }
  }

  const speedup = full.ms / Math.max(0.001, fast.ms);
  const ok = diffs === 0 && fast.peak === 0 && full.peak > 0;
  return {
    ok,
    note: diffs
      ? `${diffs} of ${blocks * n} diameters differ, worst ${worst.toExponential(2)} at block ${whereB} section ${whereI}`
      : fast.peak !== 0
        ? `artOnly emitted audio at ${fast.peak.toFixed(5)} — the cut is not being taken`
        : full.peak === 0
          ? `the full path was silent too, so the control proves nothing`
          : `${blocks * n} diameters bit-identical over ${blocks} blocks; artOnly silent against ` +
            `${full.peak.toFixed(3)} peak; ${speedup.toFixed(1)}x faster (${full.ms.toFixed(0)} to ${fast.ms.toFixed(0)} ms)`,
  };
});
