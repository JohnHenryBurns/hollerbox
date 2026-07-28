// The header chrome — the part of every page that is the SITE rather than the page — lived as
// four pasted copies, and the copies drifted three separate ways: rules that were byte-identical
// still drew four navs, About grew a second h1, and the mobile rules addressed an id two commits
// dead. It is one file now, chrome.css, so drift between copies is impossible by construction.
// What can still rot is the construction itself: a page that stops linking the file, a page that
// quietly grows its own copy back, a page that stops declaring a variable the chrome expects.
// Those are what this checks.
check("four pages, one chrome", () => {
  const fs = require("fs"), path = require("path"), bad = [];
  const root = path.join(__dirname, "..", "..");
  const FILES = { index: "index.html", wizard: "wizard.html",
                  about: "about.html", bench: path.join("lab", "bench.html") };
  const page = {};
  for (const [k, f] of Object.entries(FILES)) page[k] = fs.readFileSync(path.join(root, f), "utf8");

  // THE FILE ITSELF still contains what the pages gave up: the header, one brand rule, the way
  // home, and the nav with its chrome pinned — pinned because themed is how it drifted while
  // byte-identical.
  let chrome = "";
  try { chrome = fs.readFileSync(path.join(root, "chrome.css"), "utf8"); }
  catch { bad.push("chrome.css is missing"); }
  for (const [what, re] of [
    ["the header rule",   /^header\{display:flex/m],
    ["one h1 rule",       /^h1\{color:var\(--hot\)/m],
    ["the brand link",    /^h1 a\{color:inherit;text-decoration:none\}/m],
    ["the spacer",        /^\.spacer\{flex:1\}/m],
    ["the nav",           /^\.nav\{display:flex/m],
    ["the pinned border", /border:1px solid #4c575e/],
    ["the here marker",   /^\.nav \.here\{/m]])
    if (chrome && !re.test(chrome)) bad.push(`chrome.css has lost ${what}`);

  // EVERY PAGE WEARS IT, exactly once, and before its own <style> — a page's overrides win by
  // coming later, which stops working the moment the link slides down the file.
  for (const [k, s] of Object.entries(page)) {
    const href = k === "bench" ? "../chrome.css" : "chrome.css";
    const links = s.split(`href="${href}"`).length - 1;
    if (links !== 1) { bad.push(`${k} links the chrome ${links} times`); continue; }
    if (s.indexOf(`href="${href}"`) > s.indexOf("<style>"))
      bad.push(`${k} links the chrome after its own styles — its overrides would lose`);
  }

  // AND NO PAGE GROWS ITS COPY BACK. Overrides are legitimate — About pads .nav to its column,
  // index underlines the header in the accent — so what is banned is not the selectors but the
  // copy: a top-level h1 rule (media-query overrides are indented and exempt), the nav block's
  // comment, or the nav's own compound selectors reappearing in a page.
  for (const [k, s] of Object.entries(page)) {
    if (/^h1\{/m.test(s)) bad.push(`${k} declares its own top-level h1`);
    if (s.includes("/* The navigation")) bad.push(`${k} carries the nav block again`);
    if (/\.nav a,\s*\.nav span/.test(s)) bad.push(`${k} restyles the nav's links wholesale`);
  }

  // THE CHROME'S CONTRACT: it reads four variables from the page, so every page must declare
  // them. The bench went a year without --sans and --rule and the difference was visible.
  for (const [k, s] of Object.entries(page))
    for (const v of ["--hot:", "--hot-ink:", "--rule:", "--sans:"])
      if (!s.includes(v)) bad.push(`${k} does not declare ${v.slice(0, -1)}`);

  // THE MARKUP: the name a link home from every page including home; four links, same words,
  // same order; each page marking itself and only itself.
  const WANT = ["Throat", "Make a Voice", "Lab", "About"];
  const HERE = { index: "Throat", wizard: "Make a Voice", bench: "Lab", about: "About" };
  for (const [k, s] of Object.entries(page)) {
    const home = k === "bench" ? "\\.\\./index\\.html" : "index\\.html";
    if (!new RegExp(`<h1><a href="${home}">Hollerbox</a></h1>`).test(s))
      bad.push(`${k}'s brand is not a link to the index`);
    const nav = (s.match(/<nav class="nav">([\s\S]*?)<\/nav>/) || [])[1];
    if (!nav) { bad.push(`${k} has no nav`); continue; }
    const items = [...nav.matchAll(/<(a|span)[^>]*>([^<]+)</g)];
    if (items.map(m => m[2].trim()).join("|") !== WANT.join("|"))
      bad.push(`${k}'s nav reads "${items.map(m => m[2].trim()).join(" · ")}"`);
    const here = items.filter(m => m[0].includes('class="here"')).map(m => m[2].trim());
    if (here.join() !== HERE[k])
      bad.push(`${k} marks "${here.join(",") || "nothing"}" as here, not "${HERE[k]}"`);
  }

  // AND EVERY PAGE LOADS THE FACE IT NAMES.
  for (const [k, s] of Object.entries(page))
    if (!/fonts\.googleapis\.com\/css2\?family=IBM\+Plex/.test(s))
      bad.push(`${k} names IBM Plex but does not load it`);

  return { ok: bad.length === 0,
           note: bad.slice(0, 3).join("  ") ||
                 "one chrome.css, worn by all four before their own styles; no copies regrown" };
});
