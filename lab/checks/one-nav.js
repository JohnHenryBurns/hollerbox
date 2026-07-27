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
  // A quiet room is still linked. The Lab is a workbench and reads as a footnote, but it must
  // stay in the nav: carryState rewrites these links, so a voice tuned in the wizard arrives
  // there by clicking, and a Lab reachable only by typing a URL lands on the default voice
  // instead. A page nothing links to is also a page that breaks unnoticed — this one has already
  // been a dead end once, with no navigation at all, and that survived because nothing pointed
  // at it.
  // About is a room too. It was a button beside the nav pretending not to be one — reachable
  // from the throat and from nowhere else, so a visitor on the wizard had no way to find out
  // what any of this is. It lives as a dialog rather than a file, so the room is a MARKER in the
  // hash, and carryState has to put that marker back after writing the state onto every link:
  // a naive rewrite dropped it and the About link silently became a link to the throat.
  const about = rooms.find(r => r.mark === 'about');
  if (!about) bad.push("About is not a room — it is reachable from one page only");
  else {
    const sess2 = fs.readFileSync(path.join(root, "engine", "session.js"), "utf8");
    if (!/a\.dataset && a\.dataset\.mark/.test(sess2))
      bad.push("carryState does not preserve a room's own marker — About would lose it");
    const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
    if (!/has\('about'\)/.test(idx)) bad.push("nothing opens About when the marker arrives");
    if (!/h\.delete\('about'\)/.test(idx)) bad.push("closing About leaves the marker, so a reload reopens it");
  }

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
