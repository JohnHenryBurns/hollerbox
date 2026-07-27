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
  // Only rooms that ARE a page are counted against the pages. About is a room whose href is a
  // marker on another page, so a one-to-one count stopped being the right question the moment
  // a room stopped meaning a file.
  const filed = rooms.filter(r => !r.mark);
  if (filed.length !== PAGES.length)
    bad.push(`${filed.length} rooms with pages of their own, for ${PAGES.length} pages`);
  for (const r of rooms) {
    if (!fs.existsSync(path.join(root, r.href))) bad.push(`${r.href} does not exist`);
    if (!r.why) bad.push(`${r.name} does not say what it is for`);
  }
  // The Lab is a full room again. It was quiet for a while — a workbench a visitor would have
  // walked into — and it stays in the nav either way, because carryState rewrites these links
  // and a Lab reachable only by URL loses the voice on the way there.
  const lab = rooms.find(r => /bench/.test(r.href));
  if (!lab) bad.push("the Lab is not in the nav — state cannot travel to it");

  const lab = rooms.find(r => /bench/.test(r.href));
  if (!lab) bad.push("the Lab is not in the nav — state cannot travel to it");
  else if (!lab.quiet) bad.push("the Lab is not marked quiet; it is a workbench, not a room for visitors");
  for (const p of PAGES) {
    const t = fs.readFileSync(path.join(root, p), "utf8");
    if (!/\.btn\.quiet/.test(t)) bad.push(`${p} does not style a quiet room`);
  }

  return { ok: bad.length === 0,
           note: bad.join("  ") || rooms.map(r => r.name).join(" · ") + ", reachable from all three" };
});
