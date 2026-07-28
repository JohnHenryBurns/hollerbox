// The worklet reports its live state every block — the diameters the tube is drawn from, the wave
// energy that colours it, whether it is still speaking. index.html's handler lived INSIDE the
// start function that phase 2 replaced with a shared one, and went with it. The page kept reading
// `liveDiam` and nothing ever assigned it, so the tube fell back to a static shape and stopped
// moving. Reported as "the tube is not animating", and before that as "draws but does not colour".
//
// It is passed to startAudio now, so losing it means deleting an argument rather than quietly
// dropping a line out of a function body — which is what happened, and is invisible in a diff
// that replaces a whole function.
check("the page listens to the worklet", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");

  const sess = fs.readFileSync(path.join(root, "engine", "session.js"), "utf8");
  if (!/o\.onMessage/.test(sess)) bad.push("startAudio does not accept a message handler");

  const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
  if (!/onMessage:/.test(idx)) bad.push("index.html does not pass one");
  // the three things the tube needs, each read somewhere and each therefore assigned somewhere
  for (const [name, re] of [["liveDiam", /liveDiam\s*=\s*e\.data/],
                            ["energy",   /energy\s*=\s*e\.data/],
                            ["sequencing", /sequencing\s*=\s*e\.data/]]) {
    if (!re.test(idx)) bad.push(`${name} is read but never assigned from the worklet`);
  }

  // The nav used to be built by session.js and needed its own stylesheet, because it rendered
  // elements classed `btn` and each page styled those differently — the bench had no `.btn` rule
  // at all. It is four links written into each page now, so there is nothing here to check: no
  // shared component, no injected CSS, no ordering. The clauses that were here asserted the
  // machinery existed, and outlived it by two commits.


  return { ok: bad.length === 0,
           note: bad.join("  ") || "worklet state reaches the page; the nav styles itself" };
});
