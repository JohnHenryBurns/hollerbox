// Hitting play repeatedly, or changing voice mid-phrase, could trip the system: two async calls
// each got past their await and each posted a tract resize for a different voice, so whichever
// finished last left the worklet at a length the other had already built keyframes for.
//
// THE FIX IS A TICKET, NOT A LOCK. Disabling the controls while a phrase plays would stop the
// double-tap and not the mid-phrase voice change, which happens seconds later when they are live
// again — and a passage is five seconds, so locking them means you cannot stop, cannot change
// your mind, and cannot compare two voices without waiting the first out. That is the whole
// activity on the wizard.
//
// The engine already supports interruption: a new goal replaces the old and blends from wherever
// the tract currently is. Being interrupted is a supported thing, not a hazard to fence off.
check("a second tap supersedes the first rather than racing it", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");

  for (const p of ["index.html", "wizard.html"]) {
    const t = fs.readFileSync(path.join(root, p), "utf8");
    const tickets = (t.match(/const mine = \+\+turn;/g) || []).length;
    const checks = (t.match(/mine !== turn/g) || []).length;
    if (!tickets) bad.push(`${p} takes no ticket — overlapping calls race`);
    // every path that takes a ticket must check it again after its awaits, or the ticket is
    // decoration: the whole point is to bail AFTER the yield, not before it
    if (checks < tickets) bad.push(`${p}: ${tickets} ticket(s) but only ${checks} stale check(s)`);
    // and the controls must not be disabled during playback
    if (/playBtn\.disabled\s*=\s*true|\.opt\.disabled\s*=\s*true/.test(t))
      bad.push(`${p} disables a control while speaking — a passage is five seconds long`);
  }

  // a tap that restarts a phrase looks identical to one that was ignored, so it must be
  // acknowledged: the button already says Stop and the sound simply begins again
  const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
  if (!/@keyframes hb-tapped/.test(idx))
    bad.push("a restarting tap is not acknowledged — it looks the same as being ignored");

  return { ok: bad.length === 0,
           note: bad.join("  ") || "both pages ticket their utterances; nothing is disabled mid-phrase" };
});
