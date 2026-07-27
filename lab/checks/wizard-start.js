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

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(P.VOICES).filter(k => P.VOICES[k].v).length} starting voices, ` +
                 `each rebuilt exactly by the questions` };
});
