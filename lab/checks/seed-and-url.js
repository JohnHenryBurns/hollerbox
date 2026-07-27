// A seed is how a voice travels. Two things had to be true for that and neither was.
check("every preset survives its own seed", () => {
  const P = H.P, bad = [];

  // A PRESET OUTSIDE ITS OWN BOUNDS CANNOT SURVIVE ONE. Barry White sat at 58, 88 and 48 Hz
  // against floors of 80, 90 and 70 — so encoding clamped him up and a link to Barry arrived as
  // a higher voice. The same class of fault as John's `per` sitting under its own minimum: a
  // value the codec cannot express is a value that quietly changes on the way through.
  for (const k of Object.keys(P.VOICES)) {
    const v = { ...P.defaultVoice(), ...(P.VOICES[k].v || {}) };
    for (const sp of P.VOICE_SPEC) {
      if (v[sp.k] === undefined) continue;
      if (v[sp.k] < sp.lo - 1e-9 || v[sp.k] > sp.hi + 1e-9)
        bad.push(`${k}.${sp.k} = ${v[sp.k]}, outside ${sp.lo}..${sp.hi}`);
    }
  }

  // and the round trip must land close enough that the page can still tell WHICH preset it is
  let worstVoice = "", worst = 0;
  for (const k of Object.keys(P.VOICES)) {
    if (k === "custom" || !P.VOICES[k].v) continue;
    const v = { ...P.defaultVoice(), ...P.VOICES[k].v };
    const back = P.decodeVoice(P.encodeVoice(v));
    for (const sp of P.VOICE_SPEC) {
      const span = (sp.hi - sp.lo) || 1;
      const d = Math.abs((back[sp.k] ?? v[sp.k]) - v[sp.k]) / span;
      if (d > worst) { worst = d; worstVoice = `${k}.${sp.k}`; }
    }
    if (worst >= 0.005) break;
  }
  // index.html recognises an arriving seed as a preset when every parameter is within 0.5% of
  // its range; a voice that drifts further comes back as "Custom" and loses its name
  if (worst >= 0.005) bad.push(`${worstVoice} drifts ${(100*worst).toFixed(2)}% — it would arrive as Custom`);

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(P.VOICES).length} voices in bounds, worst drift ${(100*worst).toFixed(3)}%` };
});

// AND THE URL CARRIES WHAT YOU CHOSE, NOT WHAT THE PAGE OPENED WITH. setVoice and soundOut both
// run during boot and both wrote the URL, so simply arriving stamped an eighty-four character
// seed into the address bar. It fed itself: reload, and readURL found that seed, and a seed is
// not a preset name, so Man came back as Custom having never been customised.
check("the page does not write the URL before it has settled", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const t = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

  if (!/let settled = false;/.test(t)) bad.push("nothing marks when boot is over");
  const writes = t.match(/HOLLER_SESSION\.writeURL\(/g) || [];
  const gated = t.match(/if\(settled && window\.HOLLER_SESSION\)\{ HOLLER_SESSION\.writeURL\(/g) || [];
  if (writes.length !== gated.length)
    bad.push(`${writes.length} writeURL calls, ${gated.length} gated on settled`);
  if (!/settled = true;/.test(t)) bad.push("settled is never set");
  // and an arriving seed must be matched against the presets rather than always becoming Custom
  if (!/const near = Object\.keys\(VOICES\)/.test(t))
    bad.push("an arriving seed is not matched against the presets");

  return { ok: bad.length === 0,
           note: bad.join("  ") || `${writes.length} writes, all after boot; a preset seed keeps its name` };
});
