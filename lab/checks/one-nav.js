// Three pages had three navigations. index offered "Make a voice · Bench · About", the wizard
// offered "Back · Bench", and THE BENCH OFFERED NOTHING — a page you could reach and not leave.
// "Back" did not say where it went and "Bench" did not say what it was.
//
// Checked here rather than left to notice, because a missing way out is invisible to everybody
// who already knows the URLs.
check("every page can reach every other", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");
  const PAGES = ["index.html", "wizard.html", "lab/bench.html"];

  for (const p of PAGES) {
    const t = fs.readFileSync(path.join(root, p), "utf8");
    if (!/mountNav\(/.test(t)) bad.push(`${p} does not mount the navigation`);
    if (!/id="nav"/.test(t)) bad.push(`${p} has nowhere to mount it`);
    // and the marker has to be visible, or the current room looks like a broken link
    if (!/\.btn\.here/.test(t)) bad.push(`${p} does not style the current room`);
  }

  // the rooms themselves must all exist, and be named for what they are for
  const sess = fs.readFileSync(path.join(root, "engine", "session.js"), "utf8");
  const m = sess.match(/const ROOMS = \[[\s\S]*?\];/);
  if (!m) return { ok: false, note: "no ROOMS list in session.js" };
  const rooms = new Function(m[0] + "\nreturn ROOMS;")();
  if (rooms.length !== PAGES.length) bad.push(`${rooms.length} rooms for ${PAGES.length} pages`);
  for (const r of rooms) {
    if (!fs.existsSync(path.join(root, r.href))) bad.push(`${r.href} does not exist`);
    if (!r.why) bad.push(`${r.name} does not say what it is for`);
  }

  return { ok: bad.length === 0,
           note: bad.join("  ") || rooms.map(r => r.name).join(" · ") + ", reachable from all three" };
});
