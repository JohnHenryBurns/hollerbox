// The fast tier only stays fast if a full run records what it cost, and the recording condition
// has already broken once: it read `!quick` when quick was a flag, then quick became the default
// and the condition quietly stopped meaning what it said. A fresh clone ran everything, recorded
// nothing, and never got fast — the tier silently doing nothing, which looks exactly like the
// tier working.
check("a full run records its timings", () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "check.js"), "utf8");
  const bad = [];

  // the condition must be about WHAT RAN, not about which flag was passed
  if (/if\s*\(\s*!terms\.length\s*&&\s*!quick\s*\)/.test(src))
    bad.push("timings are recorded on `!quick`, which stopped meaning `ran everything`");
  if (!/ranEverything/.test(src))
    bad.push("nothing decides whether the full set actually ran");

  // and a run with no timings must still run everything rather than skipping on absent data
  if (!/no recorded timings yet/.test(src))
    bad.push("a fresh clone is not told why the first run is slow");

  return { ok: bad.length === 0,
           note: bad.join("  ") || "recorded on what ran, not on which flag was passed" };
});
