// Twelve lines of JavaScript were sitting inside about.html's <style> block — the tail of the
// old showAbout() from when About was a dialog on the throat page, left behind when it became a
// file of its own. Nothing said so. The page loaded, the header drew, the prose read fine.
//
// What it cost was invisible and total: a CSS parser that meets a selector it cannot parse does
// not skip the line, it skips forward looking for a matching brace, and everything it passes on
// the way is discarded. The two rules that made the tabs work —
//
//     .cardbody section[data-tab]{display:none}
//     .cardbody section[data-tab].on{display:block}
//
// — sat after the stray code and were swallowed whole. The browser reported 30 rules where the
// file wrote 33. So the tab buttons highlighted correctly, the script toggled `.on` correctly,
// and the panel never changed, because the class it was toggling had no rule behind it. Three
// correct-looking things and one silent hole.
//
// A stylesheet cannot report that it dropped something, so this reads the file the way the
// parser does: a run of `selector { declarations }`, and anything that is not that shape is
// something the browser will quietly eat along with whatever follows it.
check("no stylesheet eats its own rules", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");
  const FILES = ["index.html", "wizard.html", "about.html", path.join("lab", "bench.html"),
                 "chrome.css"];

  // things that cannot appear in a stylesheet outside a comment or a string
  const NOT_CSS = [[/=>/, "an arrow function"],
                   [/\bfunction\s*\(/, "a function"],
                   [/\bdocument\./, "a DOM reference"],
                   [/\bwindow\./, "a window reference"],
                   [/\bconst\s+\w+\s*=/, "a declaration"],
                   [/\.forEach\(/, "a loop"],
                   [/\baddEventListener\b/, "a listener"],
                   [/^\s*\/\//, "a // comment, which CSS does not have"]];

  for (const f of FILES) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    const blocks = f.endsWith(".css") ? [src]
                 : [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    if (!blocks.length) continue;

    blocks.forEach((raw, bi) => {
      const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");     // real comments are fine
      const where = blocks.length > 1 ? `${f} style block ${bi + 1}` : f;

      css.split("\n").forEach((line, i) => {
        for (const [rx, what] of NOT_CSS)
          if (rx.test(line)) {
            bad.push(`${where} line ${i + 1} has ${what}: "${line.trim().slice(0, 44)}"`);
            break;
          }
      });

      // and the braces must close, since an unclosed one swallows the rest of the sheet
      const open = (css.match(/\{/g) || []).length, close = (css.match(/\}/g) || []).length;
      if (open !== close) bad.push(`${where} has ${open} { against ${close} }`);
    });
  }

  return { ok: bad.length === 0,
           note: bad.slice(0, 3).join("  ") ||
                 `${FILES.length} stylesheets, every rule the shape a parser expects` };
});
