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
    // Built by script OR written into the page. The bench writes its own, because it is the page
    // most likely to fail to boot — it fetches an engine from a URL you can point anywhere — and
    // a way out of a room must not depend on the room working. What matters is that every room
    // is reachable from every page, not which mechanism put the links there.
    const built = /mountNav\(/.test(t);
    const written = /class="hb-room"/.test(t);
    if (!built && !written) bad.push(`${p} has no navigation, built or written`);

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
  // A HAND-WRITTEN NAV IS CHECKED AGAINST THE ROOM LIST, since nothing generates it and nothing
  // else would notice a room going missing from it.
  for (const p2 of PAGES) {
    const t2 = fs.readFileSync(path.join(root, p2), "utf8");
    if (!/class="hb-room"/.test(t2)) continue;
    for (const r of rooms) {
      // The room you are ON is a span with no href — that is the point of marking it — so the
      // name is what to look for, not the address. Checking the address would demand that every
      // page link to itself.
      if (!t2.includes(r.name)) bad.push(`${p2} writes its own nav and omits ${r.name}`);
    }
  }

  const lab = rooms.find(r => /bench/.test(r.href));
  if (!lab) bad.push("the Lab is not in the nav — state cannot travel to it");

  // THIS FILE HAD THE SAME BLOCK TWICE, and `const lab` twice in one scope, so it threw on load
  // and every run reported it as a load failure rather than as a failing assertion. The second
  // copy was the older one: it required the Lab to be marked `quiet`, which stopped being true
  // when the Lab went back to being a full room. The replacement was written above it and the
  // original was never deleted.
  //
  // A check that cannot load is worse than a check that fails — it fails loudly for the wrong
  // reason, and a whole run's worth of red gets read as "that one is broken again".

  // AND THE WORDMARK IS NOT A ROOM. It goes home carrying nothing, which is the one thing in the
  // nav that is not a place — so it must not be counted among them, and it must not be rewritten
  // by carryState.
  if (!/home\.dataset\.clean = '1'/.test(sess))
    bad.push("the wordmark is not marked clean — carryState would attach a voice to it");
  if (!/a\.dataset\.clean\) continue/.test(sess))
    bad.push("carryState does not skip clean links, so there is no way back to nothing");

  // and the bench must mount its nav before anything that can throw, or a boot failure leaves a
  // page that can be reached and not left — which is the fault the nav exists to fix
  const bench = fs.readFileSync(path.join(root, "lab", "bench.html"), "utf8");
  if (bench.indexOf("mountNav") > bench.indexOf("  build();"))
    bad.push("the bench mounts its nav after build(); a boot failure would strand the page");

  return { ok: bad.length === 0,
           note: bad.join("  ") || rooms.map(r => r.name).join(" · ") + ", reachable from all three" };
});
