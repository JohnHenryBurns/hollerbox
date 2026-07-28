#!/usr/bin/env node
//
// THE HEADER, MEASURED. Renders the four pages at three widths and reports the geometry of the
// band: header box, brand, nav, and the current-page pill.
//
// It exists because rule text lied twice. The nav rules were byte-identical across four pages
// and drew four different navs; then the rules moved into one file and the headers still stood
// 63.5, 68.8 and 67.4 px tall, because line-height was inherited from each page's body and body
// padding inset the band on the bench. Identity of CSS is not identity of geometry, and only one
// of those is what a person sees.
//
// Not in the gate: it needs a browser, and the gate is node and half a minute. Run it when the
// chrome changes.
//
//   node lab/header-measure.js            # requires a local chromium; path below
//
const puppeteer = require('/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer');
const PAGES = {index:'index.html', wizard:'wizard.html', about:'about.html', bench:'lab/bench.html'};
const WIDTHS = [1200, 800, 390];

(async () => {
  const b = await puppeteer.launch({args:['--no-sandbox'],
    executablePath:'/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome'});
  const out = {};
  for (const w of WIDTHS) {
    out[w] = {};
    for (const [k, f] of Object.entries(PAGES)) {
      const p = await b.newPage();
      await p.setViewport({width:w, height:900});
      await p.goto(require('path').join('file://', __dirname, '..') + '/' + f, {waitUntil:'load'});
      await new Promise(r => setTimeout(r, 400));
      out[w][k] = await p.evaluate(() => {
        const px = n => Math.round(n*10)/10;
        const g = el => { if(!el) return null; const r = el.getBoundingClientRect(), c = getComputedStyle(el);
          return {x:px(r.x), y:px(r.y), w:px(r.width), h:px(r.height),
                  pad:c.padding, mar:c.margin, font:c.fontSize, lh:c.lineHeight,
                  bb:c.borderBottomWidth+' '+c.borderBottomColor, gap:c.gap}; };
        const hd = document.querySelector('header'), nav = document.querySelector('.nav');
        const h1 = document.querySelector('h1'), sub = document.querySelector('header .sub');
        const pill = document.querySelector('.nav .here');
        return {header:g(hd), nav:g(nav), h1:g(h1), sub:sub?g(sub):null, here:g(pill),
                pills:[...document.querySelectorAll('.nav a,.nav span')].map(e=>{
                  const r=e.getBoundingClientRect(); return {t:e.textContent.trim(), w:px(r.width), h:px(r.height), x:px(r.x)};})};
      });
      await p.close();
    }
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
