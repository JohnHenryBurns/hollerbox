// Four pages carry the same header chrome as four pasted copies, and pasted copies drift — that
// is not a prediction, it is the history. The nav rules were byte-identical for months and still
// drew four different navs, because they leaned on page variables that meant different things in
// different rooms; About grew a second h1 rule and the brand quietly stood half again as tall
// there; the mobile rules went on addressing #nav for two commits after the last #nav was
// deleted. Each was aligned by hand once already. This is the alarm that rings the next time,
// because an alignment nobody is watching is just the starting position of the next drift.
check("four pages, one chrome", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");
  const FILES = { index: "index.html", wizard: "wizard.html",
                  about: "about.html", bench: path.join("lab", "bench.html") };
  const page = {};
  for (const [k, f] of Object.entries(FILES)) page[k] = fs.readFileSync(path.join(root, f), "utf8");

  // THE NAV STYLE BLOCK, BYTE-IDENTICAL. From its comment to its last rule, the exact span that
  // is pasted between pages. Identical as bytes, not as effect — effect is what drifted last
  // time while the bytes agreed, so the block is written to depend only on values every page
  // declares identically, and this clause keeps anyone from quietly re-theming one copy.
  const navBlock = s => (s.match(/\/\* The navigation[\s\S]*?font-weight:600\}/) || [null])[0];
  const ref = navBlock(page.index);
  if (!ref) bad.push("index.html has lost the nav style block");
  for (const k of ["wizard", "about", "bench"]) {
    const b = navBlock(page[k]);
    if (!b) { bad.push(`${k} has lost the nav style block`); continue; }
    if (b !== ref) {
      const A = ref.split("\n"), B = b.split("\n");
      let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
      bad.push(`${k}'s nav block departs from index's at its line ${i + 1}: ` +
               `"${(B[i] ?? "<ends early>").trim().slice(0, 60)}"`);
    }
  }

  // THE BRAND RULE, ONE PER PAGE AND THE SAME ON ALL FOUR. About had two and the later won.
  // Only rules at the start of a line count — the mobile overrides inside media queries are
  // indented, are per-page by design, and are none of this check's business.
  const h1s = s => s.match(/^h1\{[^}]*\}/gm) || [];
  const h1ref = h1s(page.index)[0];
  for (const [k, s] of Object.entries(page)) {
    const r = h1s(s);
    if (r.length !== 1) bad.push(`${k} declares h1 ${r.length} times at top level`);
    else if (r[0] !== h1ref) bad.push(`${k}'s h1 rule differs from index's`);
  }

  // THE NAME IS A LINK, AND IT GOES HOME. From every page, including home.
  for (const [k, s] of Object.entries(page)) {
    const home = k === "bench" ? "\\.\\./index\\.html" : "index\\.html";
    if (!new RegExp(`<h1><a href="${home}">Hollerbox</a></h1>`).test(s))
      bad.push(`${k}'s brand is not a link to the index`);
  }

  // FOUR LINKS, SAME WORDS, SAME ORDER, EACH PAGE MARKING ITSELF AND ONLY ITSELF. The labels are
  // read out of the markup rather than assumed, so renaming a page means changing four files or
  // hearing about it — which is the point.
  const WANT = ["Throat", "Make a Voice", "Lab", "About"];
  const HERE = { index: "Throat", wizard: "Make a Voice", bench: "Lab", about: "About" };
  for (const [k, s] of Object.entries(page)) {
    const nav = (s.match(/<nav class="nav">([\s\S]*?)<\/nav>/) || [])[1];
    if (!nav) { bad.push(`${k} has no nav`); continue; }
    const items = [...nav.matchAll(/<(a|span)[^>]*>([^<]+)</g)];
    const labels = items.map(m => m[2].trim());
    if (labels.join("|") !== WANT.join("|"))
      bad.push(`${k}'s nav reads "${labels.join(" · ")}"`);
    const here = items.filter(m => m[0].includes('class="here"')).map(m => m[2].trim());
    if (here.join() !== HERE[k])
      bad.push(`${k} marks "${here.join(",") || "nothing"}" as here, not "${HERE[k]}"`);
  }

  // AND EVERY PAGE LOADS THE FACE IT NAMES. Three pages declared IBM Plex for a year while only
  // index fetched it, so the nav's font depended on which page you were reading it from.
  for (const [k, s] of Object.entries(page)) {
    if (!/fonts\.googleapis\.com\/css2\?family=IBM\+Plex/.test(s))
      bad.push(`${k} names IBM Plex but does not load it`);
  }

  return { ok: bad.length === 0,
           note: bad.slice(0, 3).join("  ") ||
                 "nav block byte-identical ×4; one h1 each; the name links home; fonts fetched" };
});
