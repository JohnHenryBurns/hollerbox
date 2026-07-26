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

  // ── ONE LIBRARY OF THINGS TO SAY ────────────────────────────────────────
  //
  // The bench had twelve probes, each chosen because it found something and carrying a note
  // about what. The wizard had six passages, long enough to judge a voice by. There was never a
  // reason a probe could not be read in the wizard or a passage swept in the bench — they were
  // separate because they were written on different days in different files.
  //
  // `why` is not decoration. Half of these exist because they broke something, and a phrase
  // whose purpose is forgotten gets quietly dropped the next time the list is tidied.
  const PHRASES = [
    { text: 'Hello World',                kind: 'probe', why: 'the smallest sanity check' },
    { text: 'I love my daughter',         kind: 'probe', why: 'the words that found the final-y and final-e bugs' },
    { text: 'my wife is great',           kind: 'probe', why: 'three lexical exceptions in four words: my, is, great' },
    { text: 'hello Jupiter and Maximus',  kind: 'probe', why: 'dictionary names, and the /d\u0292/ and /ks/ clusters' },
    { text: 'she sells sea shells',       kind: 'probe', why: '/s/ against /\u0283/ \u2014 the pair the report tier measures' },
    { text: 'Peter Piper picks a peck',   kind: 'probe', why: 'voiceless stops back to back: VOT and aspiration' },
    { text: 'bad bat bed bet',            kind: 'probe', why: "8.1's coda-voicing pairs, heard rather than measured" },
    { text: 'banana and a tomato',        kind: 'probe', why: 'stress placement, and the schwas either side of it' },
    { text: 'red leather yellow leather', kind: 'probe', why: '/l/ and /r/ \u2014 what the side branch exists for' },
    { text: 'how now brown cow',          kind: 'probe', why: 'the /a\u028a/ diphthong, four times' },
    { text: 'my mother and my brother',   kind: 'probe', why: 'nasals, and the /\u00f0/ that still hisses' },
    { text: 'the quick brown fox jumps over the lazy dog',
                                          kind: 'probe', why: 'long enough to hear phrase rhythm rather than word rhythm' },

    { text: 'It was the best of times, it was the worst of times.',
      kind: 'passage', why: 'Dickens \u00b7 A Tale of Two Cities, 1859' },
    { text: 'Call me Ishmael. Some years ago, never mind how long precisely, I thought I would sail about a little.',
      kind: 'passage', why: 'Melville \u00b7 Moby-Dick, 1851' },
    { text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      kind: 'passage', why: 'Austen \u00b7 Pride and Prejudice, 1813' },
    { text: 'I have spread my dreams under your feet. Tread softly because you tread on my dreams.',
      kind: 'passage', why: 'Yeats \u00b7 He Wishes for the Cloths of Heaven, 1899' },
    { text: 'Two roads diverged in a wood, and I took the one less travelled by, and that has made all the difference.',
      kind: 'passage', why: 'Frost \u00b7 The Road Not Taken, 1916' },
  ];

  // ── THE SHARED SELECTOR ─────────────────────────────────────────────────
  //
  // Two dropdowns and a text box, mounted into whatever element a page gives it. Deliberately
  // unstyled beyond inheriting: the three pages have different palettes and different amounts of
  // room, and a component that imposes its own look would be fought rather than used.
  //
  // It owns no state. The page holds the current voice and phrase and passes them in; the
  // selector reports changes back. That way there is still exactly one answer to "what is the
  // current voice", and it is not in here.
  function mountSelector(el, opts) {
    const o = opts || {};
    const P = eng();
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    if (!host) return null;

    const vSel = document.createElement('select');
    vSel.setAttribute('aria-label', 'Voice');
    for (const k of Object.keys(P.VOICES)) {
      if (o.voices && !o.voices.includes(k)) continue;
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = (P.VOICES[k].label || k);
      vSel.appendChild(opt);
    }
    const seedOpt = document.createElement('option');
    seedOpt.value = '__seed'; seedOpt.textContent = 'paste a seed\u2026';
    vSel.appendChild(seedOpt);

    const pSel = document.createElement('select');
    pSel.setAttribute('aria-label', 'Phrase');
    let last = '';
    for (const ph of PHRASES) {
      if (o.kinds && !o.kinds.includes(ph.kind)) continue;
      if (ph.kind !== last) {
        const g = document.createElement('option');
        g.disabled = true;
        g.textContent = ph.kind === 'probe' ? '\u2014 test phrases \u2014' : '\u2014 passages \u2014';
        pSel.appendChild(g);
        last = ph.kind;
      }
      const opt = document.createElement('option');
      opt.value = ph.text;
      opt.textContent = ph.kind === 'probe' ? ph.text : ph.why;
      opt.title = ph.why;
      pSel.appendChild(opt);
    }

    const own = document.createElement('input');
    own.placeholder = 'or type your own';

    host.appendChild(vSel); host.appendChild(pSel); host.appendChild(own);

    vSel.addEventListener('change', () => {
      if (vSel.value === '__seed') {
        const s = prompt('Paste a voice seed');
        vSel.value = o.voiceName || Object.keys(P.VOICES)[0];
        if (s && o.onVoice) {
          try { o.onVoice(P.decodeVoice(s.trim()), 'seed'); }
          catch (e) { /* a bad seed changes nothing, which is better than a broken voice */ }
        }
        return;
      }
      if (o.onVoice) {
        const k = vSel.value;
        o.onVoice({ ...P.defaultVoice(), ...(P.VOICES[k].v || {}),
                    art: P.VOICES[k].art || null, name: k }, k);
      }
    });
    const say = () => { if (o.onPhrase) o.onPhrase(own.value.trim() || pSel.value); };
    pSel.addEventListener('change', () => { own.value = ''; say(); });
    own.addEventListener('keydown', e => { if (e.key === 'Enter') say(); });

    return {
      el: host, voiceSel: vSel, phraseSel: pSel, input: own,
      /** what the page should say now: typed text wins over the dropdown */
      phrase: () => own.value.trim() || pSel.value,
      setVoice: k => { if (k && [...vSel.options].some(x => x.value === k)) vSel.value = k; },
      setPhrase: t => { own.value = ''; if ([...pSel.options].some(x => x.value === t)) pSel.value = t;
                        else own.value = t; },
    };
  }

  // ── STATE THAT SURVIVES THE TRIP ────────────────────────────────────────
  //
  // Voice and phrase in the URL, so tuning a voice in the wizard and pressing Bench keeps both,
  // and a pasted link reproduces exactly what the sender heard.
  //
  // TWO FIELDS, NOT ONE. A seed is 42 voice parameters and no text; the phrase is text and no
  // voice. Folding them together would mean a new seed every time a word changed, and the point
  // of a seed is that the same voice can say anything.
  //
  // In the hash rather than the query, for three reasons: no server sees it, changing it does
  // not reload the page, and `?src=` already means something specific to the bench. Written with
  // replaceState so that tuning a voice does not fill the back button with every intermediate
  // step — a person pressing Back wants the page they came from, not the knob they last moved.
  function readURL() {
    const out = {};
    try {
      const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const v = h.get('v');
      if (v) { try { out.voice = eng().decodeVoice(v); out.seed = v; } catch (e) { /* a bad seed is ignored, not fatal */ } }
      const say = h.get('say');
      if (say) out.phrase = say;
    } catch (e) { /* no location, or a hash that is not ours */ }
    return out;
  }

  function writeURL(state) {
    try {
      const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      if (state.voice) h.set('v', typeof state.voice === 'string' ? state.voice
                                                                 : eng().encodeVoice(state.voice));
      if (state.phrase !== undefined) {
        if (state.phrase) h.set('say', state.phrase); else h.delete('say');
      }
      history.replaceState(null, '', location.pathname + location.search + '#' + h.toString());
    } catch (e) { /* a URL that will not update is not worth failing over */ }
  }

  /** Rewrite the links between the pages so the current state travels with them. Called after
   *  any change; cheap, and it means every route into another page carries the state rather
   *  than only the ones somebody remembered to wire. */
  function carryState(state) {
    let tail = '';
    try {
      const h = new URLSearchParams();
      if (state.voice) h.set('v', typeof state.voice === 'string' ? state.voice
                                                                  : eng().encodeVoice(state.voice));
      if (state.phrase) h.set('say', state.phrase);
      tail = '#' + h.toString();
    } catch (e) { return; }
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!/\.html(\?|#|$)/.test(href)) continue;          // only our own pages
      a.setAttribute('href', href.split('#')[0] + tail);
    }
  }

  root.HOLLER_SESSION = { planWord, planSpeech, chainFor, loadEngine, startAudio,
                          PHRASES, mountSelector, readURL, writeURL, carryState };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (globalThis.HOLLER_SESSION);
}
