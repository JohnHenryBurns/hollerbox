// One title and one four-item navigation on every page, with the page you are on marked.
//
// This check replaces a longer one that had grown a clause for every special case the nav had
// accumulated: a room that was "quiet", a room that was a marker rather than a place, a wordmark
// that carried no state, and a page that wrote its own links because it could not rely on the
// script. All of that is gone. Four pages, four links, one of them marked.
check("every page can reach every other", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");
  const PAGES = ["index.html", "wizard.html", "about.html", "lab/bench.html"];

  const sess = fs.readFileSync(path.join(root, "engine", "session.js"), "utf8");
  const m = sess.match(/const ROOMS = \[[\s\S]*?\];/);
  if (!m) return { ok: false, note: "no room list in session.js" };
  const rooms = new Function(m[0] + "\nreturn ROOMS;")();

  if (rooms.length !== PAGES.length)
    bad.push(`${rooms.length} rooms for ${PAGES.length} pages`);

  for (const r of rooms) {
    if (!fs.existsSync(path.join(root, r.href))) bad.push(`${r.href} does not exist`);
    if (!r.why) bad.push(`${r.name} does not say what it is for`);
    // every room must be a real page — no markers, no fragments, no rooms that are dialogs
    if (/#/.test(r.href)) bad.push(`${r.name} points at a fragment rather than a page`);
  }

  for (const p of PAGES) {
    const t = fs.readFileSync(path.join(root, p), "utf8");
    if (!/id="nav"/.test(t)) bad.push(`${p} has nowhere to put the navigation`);
    if (!/mountNav\(/.test(t)) bad.push(`${p} does not mount the navigation`);
    // and the page tells mountNav which page it is, or nothing gets marked
    const call = (t.match(/mountNav\(\s*['"]nav['"]\s*,\s*['"]([^'"]+)['"]/) || [])[1];
    if (!call) bad.push(`${p} does not tell mountNav which page it is`);
    else if (!p.endsWith(call)) bad.push(`${p} calls itself ${call}`);
  }

  // the one you are on is a span, not a link — a nav that links to the current page invites a
  // pointless reload, and a nav that omits it makes every page look like a different app
  if (!/document\.createElement\(mine \? 'span' : 'a'\)/.test(sess))
    bad.push("the current page is not marked differently from the others");

  return { ok: bad.length === 0,
           note: bad.join("  ") || rooms.map(r => r.name).join(" · ") + ", on all four pages" };
});
