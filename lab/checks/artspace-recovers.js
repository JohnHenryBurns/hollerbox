//
// THE INVERSION RECOVERS A PLANTED POSTURE.
//
// `lab/artspace.js` reads a tract shape back into the six articulators, so that measured
// articulography can be compared against what the engine ACTUALLY did rather than against the
// keyframe track it draws. Everything downstream of it — the whole `--actual` half of
// `lab/trajectories.js` — is a comparison in a coordinate system this file is responsible for.
//
// Gate rather than report: "a shape made by `articulate` can be read back to the posture that made
// it" is true of any voice and any tuning. It is not a band anybody calibrated today.
//
// The negative control matters more than the assertion. A search that returned its starting point
// unchanged would pass a badly written version of this, and a forward map that had quietly stopped
// depending on its arguments would pass it too. So it also asserts that a deliberately
// unreachable shape is NOT reported as a perfect fit.
//

check("the posture inversion recovers a planted posture", () => {
  const path = require("path");
  const AS = require(path.join(__dirname, "..", "artspace.js"));
  const P = H.P;
  const n = 44;

  // 1. every posture the engine actually visits must come back, in SHAPE
  const bad = [];
  let worstRms = 0;
  for (const [sym, A] of Object.entries(P.ART)) {
    const got = AS.fit(P.articulate(A, n), n);
    worstRms = Math.max(worstRms, got.rms);
    if (got.rms > 1e-6) bad.push(`${sym} rms ${got.rms.toFixed(5)}`);
  }

  // 2. NEGATIVE CONTROL. A shape no posture can make must not report a perfect fit. Alternating
  //    wide and narrow sections is not something two humps and a jaw can produce; if this came
  //    back at rms 0 the fit would be reporting success on anything at all.
  const impossible = new Float64Array(n);
  for (let i = 0; i < n; i++) impossible[i] = (i % 2) ? 0.30 : 1.90;
  const ctl = AS.fit(impossible, n);

  // 3. And the parameters themselves must come back wherever the shape does not pin them by
  //    accident. Reported, not asserted per-symbol: `articulate` floors at 0.02 and the lip cap is
  //    a `min`, so a closure genuinely does not determine the tongue behind it.
  let pinned = 0;
  for (const [, A] of Object.entries(P.ART)) {
    const got = AS.fit(P.articulate(A, n), n);
    let dev = 0;
    for (const k of AS.ARTS) dev = Math.max(dev, Math.abs(got.A[k] - A[k]));
    if (dev <= 0.05) pinned++;
  }
  const total = Object.keys(P.ART).length;

  const ok = bad.length === 0 && ctl.rms > 0.05;
  return {
    ok,
    note: ok
      ? `${total} postures, worst shape rms ${worstRms.toFixed(7)}; ` +
        `${pinned}/${total} also pin every parameter; unreachable shape rejected at rms ${ctl.rms.toFixed(3)}`
      : bad.length
        ? `${bad.length} postures not recovered: ${bad.slice(0, 4).join(", ")}`
        : `negative control passed the fit: an unreachable shape came back at rms ${ctl.rms.toFixed(5)}`,
  };
});
