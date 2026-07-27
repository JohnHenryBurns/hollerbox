// The wizard had two sources of truth for the voice and the buttons described the wrong one.
//
// Every question used to have exactly one option that patched NOTHING — "as it is", "normal" —
// which silently inherited whatever BASE held. A seed arriving in the URL overwrote BASE. So you
// could arrive from a link whose sect was 26, touch nothing, and read "Grown up" on a button
// while the tract was the size "Tiny" sets. There was no way to tell from the page which of the
// two was driving what you heard.
//
// Two things fix it and both are checked here: every option states its values, and an arriving
// voice is expressed in the wizard's own vocabulary rather than hidden underneath it.
check("the wizard's buttons describe the voice that is playing", () => {
  const fs = require("fs"), path = require("path"), P = H.P, bad = [];
  const t = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");

  const Q = new Function(t.match(/const Q = \[[\s\S]*?\n\];/)[0] + "\nreturn Q;")();
  const OWNS = new Function(t.match(/const OWNS = \{[\s\S]*?\};/)[0] + "\nreturn OWNS;")();

  // NO OPTION MAY INHERIT SILENTLY. One that patches nothing means "whatever the base happens to
  // be", which is a different voice depending on how you reached the page.
  for (const q of Q)
    for (const [label, , patch] of q.opts)
      if (!Object.keys(patch).length)
        bad.push(`${q.id} "${label}" sets nothing — it inherits whatever BASE holds`);

  // and BASE must not be overwritten by an arriving seed
  if (/Object\.assign\(BASE, inbound\.voice\)/.test(t))
    bad.push("an arriving seed still overwrites BASE, underneath the buttons");
  if (!/function adoptVoice/.test(t))
    bad.push("nothing takes an arriving voice into the questions");

  // AN ADOPTED VOICE MUST COME BACK EXACTLY. Nearest option plus the remainder as a nudge: the
  // voice is reproduced and the buttons are honest about it.
  const BASE = { ...P.defaultVoice(), ...(P.VOICES.john.v || {}) };
  const src = t.match(/function adoptVoice\(v\)\{[\s\S]*?\n\}/);
  if (src) {
    const chosen = {}, nudged = {};
    for (const q of Q) chosen[q.id] = 0;
    const adopt = new Function("Q","OWNS","BASE","HOLLER","chosen","nudged","draw","showSeed",
      src[0] + "\nreturn adoptVoice;")(Q, OWNS, BASE, P, chosen, nudged, () => {}, () => {});
    const rebuild = () => {
      let v = { ...BASE };
      for (const q of Q) v = { ...v, ...q.opts[chosen[q.id]][2], ...(nudged[q.id] || {}) };
      return v;
    };
    let worst = 0, worstName = "";
    for (const name of Object.keys(P.VOICES)) {
      if (!P.VOICES[name].v) continue;
      const v = { ...P.defaultVoice(), ...P.VOICES[name].v };
      for (const k of Object.keys(nudged)) delete nudged[k];
      adopt(v);
      const back = rebuild();
      for (const sp of P.VOICE_SPEC) {
        const span = (sp.hi - sp.lo) || 1;
        const d = Math.abs((back[sp.k] ?? v[sp.k]) - v[sp.k]) / span;
        if (d > worst) { worst = d; worstName = `${name}.${sp.k}`; }
      }
    }
    if (worst > 0.005)
      bad.push(`${worstName} comes back ${(100*worst).toFixed(1)}% off — a link would not reproduce`);
  }

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Q.reduce((n,q)=>n+q.opts.length,0)} options all explicit; ` +
                 `every preset adopts and rebuilds exactly` };
});
