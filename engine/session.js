// ── ONE SPEAK PATH ────────────────────────────────────────────────────────
//
// Three pages used to hold their own copy of "turn text into a word", written at different
// times, and they had drifted. Measured before this existed:
//
//                                            index   wizard   bench
//   applies a voice's fitted postures         yes      NO      yes
//   clamps the duration at 5 seconds          YES      no      no
//   passes `open`                              no      no      YES
//
// Neither consequence was subtle. `johnfit` carries 26 fitted postures the wizard never applied,
// so a fitted voice was spoken there with somebody else's tongue. And the Austen passage ran
// 6.62 s on the main page against 8.77 s on the other two — the same text, 1.32 times longer on
// one page than another, because the main page's clamp existed to match a slider that the other
// two do not have.
//
// Every "the voice got lost" or "the phrase stopped working" bug lived in that gap: there was no
// shared answer to what the current voice IS, so each page invented one and they disagreed.
//
// This is that answer. A view may decide WHAT to say and WHO says it. It does not get to decide
// what a voice means.

(function (root) {
  'use strict';
  // Looked up when used, not when loaded, so this file can be fetched FIRST and then fetch the
  // rest. That ordering is what lets one bootstrap replace three different loaders.
  const eng = () => {
    if (!root.HOLLER) throw new Error('the engine is not loaded yet');
    return root.HOLLER;
  };

  /** Every option buildWord takes, derived from the voice in one place.
   *
   *  `D` is the natural length of the chain and nothing clamps it. The 5-second ceiling that
   *  used to sit here belonged to a duration slider, and a slider is a view concern — a page
   *  that has one may pass `stretch` to scale this, and a page that does not is unaffected.  */
  function planWord(chain, voice, opts) {
    const P = eng();
    const o = opts || {};
    const v = voice || P.defaultVoice();
    const n = o.n || Math.round(v.sect || 44);
    const per = v.per || 0.17;
    const D = Math.max(0.35, chain.length * per * (o.stretch === undefined ? 1 : o.stretch));
    return P.buildWord(chain, {
      D,
      rate: P.rateFor(chain, D, v),
      n,
      pros: v,
      stress: o.stress || null,
      // Passed explicitly rather than left to be read out of `pros`, because buildWord accepts
      // both and the two paths were how the pages drifted in the first place.
      drawl: v.drawl,
      glide: v.glide,
      stopHold: v.stopT,
      open: v.open || 0,
      art: o.art || v.art || null,
    });
  }

  /** The word and its pitch track, ready to hand to the worklet. One call, so a view cannot
   *  build a word with one voice and a contour with another — which is its own class of bug. */
  function planSpeech(chain, voice, opts) {
    const P = eng();
    const o = opts || {};
    const W = planWord(chain, voice, o);
    const f0 = P.buildF0(W.end, voice || P.defaultVoice(), { stress: o.stress || null, seg: W.seg });
    return { keys: W.keys, f0, end: W.end, seg: W.seg, art: W.art, word: W };
  }

  /** Text to a chain the engine can actually say, dropping anything it has no posture for.
   *  Every page did this differently or not at all; the wizard's version was the only one that
   *  checked, which is why a passage with an unknown symbol went silent elsewhere. */
  function chainFor(text, spell) {
    const P = eng();
    const S = spell || root.HOLLER_SPELL;
    if (!S) return { ph: [], stress: null };
    const r = S.g2p(String(text || ''));
    const known = new Set([...Object.keys(P.ART), ...Object.keys(P.DIPH), ' ']);
    const keep = r.ph.map(x => known.has(x) || String(x).slice(0, 3) === 'brk');
    return {
      ph: r.ph.filter((_, i) => keep[i]),
      stress: r.stress ? r.stress.filter((_, i) => keep[i]) : null,
    };
  }

  // ── ONE ENGINE LOAD ─────────────────────────────────────────────────────
  //
  // Three pages had three loaders. index.html and the wizard fetched with no-store and fell back
  // to a script tag; the bench searched a list of candidate URLs so that `?src=` could point it
  // at another checkout. That last one is a real feature and survives here as `src`.
  //
  // Fetched rather than linked for the reason index.html found: a content hash in the URL and a
  // BUILD constant in two files are both derived values living in tracked files, so every engine
  // edit changed them and any two branches touching the engine collided there. Fetching all of
  // it together with no-store makes the skew impossible rather than merely detectable.
  function baseFrom(src) {
    if (src) return src.replace(/[^/]*$/, '');
    // where THIS file was fetched from, so a page in a subdirectory finds its siblings
    const me = (document.currentScript && document.currentScript.src) || '';
    if (me) return me.replace(/[^/]*$/, '');
    return 'engine/';
  }

  async function loadOne(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) { new Function(await r.text())(); return true; }
    } catch (e) { /* file://, offline, CORS — fall through to a tag */ }
    return new Promise((res, rej) => {
      const t = document.createElement('script');
      t.src = url; t.onload = () => res(true); t.onerror = rej;
      document.head.appendChild(t);
    });
  }

  let engineBase = 'engine/';
  /** Load the engine. `src` may point at another checkout's phonemes.js, which is how the bench
   *  compares two versions; everything else is found beside it. */
  async function loadEngine(opts) {
    const o = opts || {};
    engineBase = baseFrom(o.src);
    await loadOne(engineBase + 'phonemes.js');
    if (o.speller !== false) await loadOne(engineBase + 'spelling.js');
    return { base: engineBase };
  }

  // ── ONE AUDIO START ─────────────────────────────────────────────────────
  //
  // A shared promise, because a flag set before the work finishes lets a second caller through
  // with no node — which happened, and presented as switching voices silencing the voice. Four
  // things call this on the main page alone.
  //
  // And 300 ms of silence before returning. An AudioWorklet gets one 128-sample block every
  // 2.90 ms and must finish inside it; the engine is interpreted before it is compiled, and cold
  // it is twice as slow as real time. The first word was rendered by a cold engine and dropped
  // samples, which sounds exactly like a click. index.html and the wizard both wait; THE BENCH
  // NEVER DID, so it popped on its first play and nobody had connected the two.
  let audioP = null;
  function startAudio(opts) { return audioP || (audioP = reallyStart(opts || {})); }
  async function reallyStart(o) {
    const ctx = new (root.AudioContext || root.webkitAudioContext)();
    const n = o.n || Math.max(24, Math.round(ctx.sampleRate * 2 * 0.175 / 350));
    // through a Blob, so the worklet cannot be served from cache while the rest is fresh
    let url = new URL(engineBase + 'tract-worklet.js', document.baseURI).href;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
    } catch (e) { /* the plain URL still works */ }
    await ctx.audioWorklet.addModule(url);
    const node = new root.AudioWorkletNode(ctx, 'tract',
      { processorOptions: { n, velar: eng().VELAR } });
    // a view may insert an analyser, a gain stage, anything — it is handed the two ends
    if (o.connect) o.connect(node, ctx); else node.connect(ctx.destination);
    await new Promise(r => setTimeout(r, o.warm === undefined ? 300 : o.warm));
    return { ctx, node, n };
  }

  root.HOLLER_SESSION = { planWord, planSpeech, chainFor, loadEngine, startAudio };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (globalThis.HOLLER_SESSION);
}
