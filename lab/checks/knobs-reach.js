// A slider narrower than the parameter it drives makes part of a voice unreachable from the
// panel, and nothing says so — the slider looks complete because it goes end to end of itself.
//
// Found by auditing: the pitch slider ran 80 to 340 against a parameter of 40 to 330, so Barry
// White at 58 Hz could not be dialled and the top forty hertz of the slider did nothing at all.
// Breathiness reached 74% of its range. And the tract-length SPEC stopped at 52 while the
// wizard's "A giant" asks for 54 — the largest voice the page offers could not survive its own
// seed, clamping on the way through the codec.
check("every slider reaches its whole parameter", () => {
  const fs = require("fs"), path = require("path"), P = H.P, bad = [];
  const t = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  const MAP = { sF0:'f0a', sBr:'brth', sHold:'drawl', sOpen:'open', sSect:'sect', sFolds:'folds' };

  for (const [ui, k] of Object.entries(MAP)) {
    const m = t.match(new RegExp('id="' + ui + '"[^>]*'));
    if (!m) { bad.push(`${ui} is not in the page`); continue; }
    const lo = +((m[0].match(/min="([-\d.]+)"/) || [])[1]);
    const hi = +((m[0].match(/max="([-\d.]+)"/) || [])[1]);
    const sp = P.VOICE_SPEC.find(x => x.k === k);
    if (!sp) { bad.push(`${ui} drives ${k}, which is not a parameter`); continue; }
    if (lo > sp.lo + 1e-9) bad.push(`${ui} starts at ${lo}, above ${k}'s ${sp.lo}`);
    if (hi < sp.hi - 1e-9) bad.push(`${ui} stops at ${hi}, below ${k}'s ${sp.hi}`);
    // and a slider running PAST its parameter has a dead end the codec will clamp
    if (hi > sp.hi + 1e-9) bad.push(`${ui} runs to ${hi}, past ${k}'s ${sp.hi} — the top does nothing`);
    if (lo < sp.lo - 1e-9) bad.push(`${ui} starts at ${lo}, below ${k}'s ${sp.lo}`);
  }

  // AND EVERY VOICE THE WIZARD OFFERS MUST BE INSIDE THE SPEC. A value outside its own bounds
  // cannot survive a seed — which is how Barry White became unshareable, and how the giant was
  // about to.
  const wiz = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");
  const Q = new Function(wiz.match(/const Q = \[[\s\S]*?\n\];/)[0] + "\nreturn Q;")();
  for (const q of Q)
    for (const [label, , patch] of q.opts)
      for (const [k, val] of Object.entries(patch)) {
        const sp = P.VOICE_SPEC.find(x => x.k === k);
        if (sp && (val < sp.lo - 1e-9 || val > sp.hi + 1e-9))
          bad.push(`the wizard's "${label}" sets ${k} to ${val}, outside ${sp.lo}..${sp.hi}`);
      }

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(MAP).length} sliders cover their parameters exactly; ` +
                 `every wizard option is in bounds` };
});
