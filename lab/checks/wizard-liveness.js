// The wizard stopped speaking after swapping between voices — reported as woman, giant, woman.
//
// Serialising speak() through a promise chain was right: several taps at once each resized the
// tract for a different voice, and whichever finished last left the worklet at a length the
// others had already built keyframes for. But it made every future utterance depend on every past
// one. A link that never settles kills the page's voice for good, with no way back but a reload.
check("one stuck utterance cannot silence the wizard", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const t = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");

  if (!/let speaking = Promise\.resolve\(\)/.test(t))
    bad.push("speak is not serialised — concurrent taps can resize the tract under each other");
  if (!/Promise\.race\(\[/.test(t))
    bad.push("a link in the chain is not raced against a deadline; one hang is permanent");
  // ctx.resume() is the one that can hang: a browser may hold that promise until it sees a
  // gesture it likes, and a tap on an option is not always one
  if (/await ctx\.resume\(\)/.test(t))
    bad.push("ctx.resume() is awaited — a browser is not obliged to settle it promptly");

  // and the chosen index must stay in range. q.opts[-1] is undefined, and every read of the
  // chosen option throws on it, which takes draw(), showSeed() and current() down together and
  // leaves the page rendered but inert.
  const guards = (t.match(/chosen\[q\.id\] >= 0 && chosen\[q\.id\] < q\.opts\.length/g) || []).length;
  if (guards < 2) bad.push(`only ${guards} guard(s) on the chosen index; adoptVoice and voice() both need one`);

  // The chain surviving a hang is demonstrated in the commit rather than here: this runner is
  // synchronous, and a check that returns a promise reports its note as "undefined" — which it
  // did, and which is its own small lesson about trusting a green tick you have not read.
  return { ok: bad.length === 0,
           note: bad.join("  ") ||
                 `serialised, raced at 2 s, ${guards} index guards` };
});
