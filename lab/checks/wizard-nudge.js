// The four questions set eighteen of forty-two parameters and each offers three to five fixed
// points. Everything between those points is unreachable, and the interesting voices are usually
// in between. A nudge jitters one question's parameters and leaves the other three alone — one
// question at a time is how you find out what a question means, where randomising everything
// gives you a voice you cannot learn anything from.
check("a nudge stays in bounds and stays near its answer", () => {
  const fs = require("fs"), path = require("path"), P = H.P, bad = [];
  const page = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");

  const m = page.match(/const OWNS = \{[\s\S]*?\};/);
  if (!m) return { ok: false, note: "no OWNS map — no question owns anything" };
  const OWNS = new Function(m[0] + "\nreturn OWNS;")();

  // every question owns something, and no parameter is owned twice — two questions moving the
  // same knob would make each one's effect depend on the other's
  const seen = {};
  for (const [q, keys] of Object.entries(OWNS)) {
    if (!keys.length) bad.push(`${q} owns nothing`);
    for (const k of keys) {
      if (!P.VOICE_SPEC.some(s => s.k === k)) bad.push(`${q} owns ${k}, which is not a parameter`);
      if (seen[k]) bad.push(`${k} is owned by both ${seen[k]} and ${q}`);
      seen[k] = q;
    }
  }

  // AROUND THE ANSWER, NOT AROUND THE LAST NUDGE. Nudging from the previous nudge is a random
  // walk: measured, "a giant" drifted from 70 Hz to 147 in five taps and stopped being a giant
  // while the button still said it was one.
  if (/const base = current\(\)/.test(page))
    bad.push("the nudge is relative to the current voice — five taps and it wanders off its answer");

  // and it must clamp: a parameter outside its own bounds cannot survive a seed, which is how
  // Barry White became unshareable
  let seed = 99, rnd = () => { seed ^= seed<<13; seed>>>=0; seed ^= seed>>17; seed ^= seed<<5;
                               seed>>>=0; return seed/4294967296; };
  const answer = { ...P.defaultVoice(), sect: 54, f0a: 70, f0b: 80, f0c: 60 };
  let oob = 0, far = 0;
  for (let i = 0; i < 200; i++) {
    for (const k of OWNS.q1 || []) {
      const sp = P.VOICE_SPEC.find(x => x.k === k);
      if (!sp) continue;
      const span = sp.hi - sp.lo;
      const v = Math.max(sp.lo, Math.min(sp.hi, answer[k] + (rnd()*2-1)*span*0.2));
      if (v < sp.lo - 1e-9 || v > sp.hi + 1e-9) oob++;
      if (Math.abs(v - answer[k]) > span*0.21) far++;
    }
  }
  if (oob) bad.push(`${oob} nudges left their parameter's bounds`);
  if (far) bad.push(`${far} nudges moved further than one step from the answer`);

  return { ok: bad.length === 0,
           note: bad.slice(0,3).join("  ") ||
                 `${Object.keys(OWNS).length} questions own ${Object.keys(seen).length} parameters, ` +
                 `no overlap; 200 nudges in bounds and within a step` };
});
