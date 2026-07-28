// A question was added to the wizard's list and its div was never added to the page. `draw()`
// walks that list and writes into `document.getElementById(q.id)`, so the fourth iteration set
// innerHTML on null and threw — and everything after the throw did not happen.
//
// What that looked like from outside was three unrelated faults. The fifth question was missing,
// because it had no element. The questions were ragged, because the loop died partway and the
// question after the missing one never drew its options at all. And play was dead, but ONLY when
// you arrived carrying a voice from another page — because that is the path that calls
// `adoptVoice`, which calls `draw`, which threw BEFORE the play buttons got their listeners.
// Arriving with nothing worked fine, which is what made it look intermittent rather than certain.
//
// Measured on the broken page: peak output amplitude 0.115 arriving bare, 0.000 arriving with a
// voice in the URL.
//
// The list and the markup are two halves of one thing and nothing but a person's memory joined
// them. This joins them.
check("every wizard question has a home", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "wizard.html"), "utf8");

  // the question list as the page declares it, in its own order
  const list = html.slice(html.indexOf("{ id:'q1'"), html.indexOf("const chosen"));
  const asked = [...list.matchAll(/\{ id:'(\w+)', key:'(\w+)'/g)].map(m => ({ id: m[1], key: m[2] }));
  // and the hosts the markup offers
  const hosts = [...html.matchAll(/<div class="opts" id="(\w+)">/g)].map(m => m[1]);

  if (asked.length < 2) return { ok: false, note: "could not read the question list" };

  for (const q of asked)
    if (!hosts.includes(q.id))
      bad.push(`${q.id} (${q.key}) is asked but has no div — draw() will throw on it`);
  for (const h of hosts)
    if (!asked.some(q => q.id === h))
      bad.push(`${h} is a div with no question behind it`);

  // Every question opens on a stated default. q5 had no entry, so the clamp in draw() pushed it
  // to option 0 and the wizard opened on "Soft" — a default nobody chose, and invisible because
  // the question it belonged to was not on the page.
  const chosen = (html.match(/const chosen = \{([^}]*)\}/) || [])[1] || "";
  for (const q of asked)
    if (!new RegExp(`\\b${q.id}\\s*:`).test(chosen))
      bad.push(`${q.id} has no default in \`chosen\``);

  // and the headings count up without a gap, since inserting a question is exactly when they rot
  const nums = [...html.matchAll(/<h2>(\d+) · /g)].map(m => +m[1]);
  const want = nums.map((_, i) => i + 1);
  if (nums.join() !== want.join())
    bad.push(`the numbered headings read ${nums.join(",")} — they should read ${want.join(",")}`);

  return { ok: bad.length === 0,
           note: bad.slice(0, 3).join("  ") ||
                 `${asked.length} questions, ${asked.length} divs, all defaulted, headings 1..${nums.length}` };
});
