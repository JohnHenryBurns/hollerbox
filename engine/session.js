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

    // AND IT MAY LISTEN. The worklet reports its live state every block — the diameters the tube
    // is drawn from, the wave energy that colours it, whether it is still speaking. index.html's
    // handler lived inside the start function this one replaced, and went with it: the page kept
    // reading `liveDiam` and nothing ever assigned it, so the tube fell back to a static shape
    // and stopped moving. Passed in now, so losing it means deleting an argument rather than
    // quietly dropping a line out of a function body.
    if (o.onMessage) node.port.onmessage = o.onMessage;
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
    // PASSAGES FIRST. The list is what the Say sheet shows in order, and somebody opening it is
    // far more likely to want something worth hearing than a four-word probe. The probes are the
    // working end of the list and they keep their notes; they are simply not the front of it.
    { text: 'To be, or not to be, that is the question.',
      kind: 'passage', why: 'Shakespeare \u00b7 Hamlet, 1601' },
    { text: 'In the beginning, God created the heavens and the earth.',
      kind: 'passage', why: 'Genesis 1:1 \u00b7 King James Version, 1611' },
    { text: 'It was the best of times, it was the worst of times.',
      kind: 'passage', why: 'Dickens \u00b7 A Tale of Two Cities, 1859' },
    { text: 'Call me Ishmael. Some years ago, never mind how long precisely, I thought I would sail about a little.',
      kind: 'passage', why: 'Melville \u00b7 Moby-Dick, 1851' },
    { text: 'Two roads diverged in a wood, and I took the one less travelled by, and that has made all the difference.',
      kind: 'passage', why: 'Frost \u00b7 The Road Not Taken, 1916' },

    // Each of these is here because it found something, and the note says what. A phrase whose
    // purpose is forgotten gets quietly dropped the next time somebody tidies the list.
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
    // "Write your own" is the first option rather than a button beside the list. It is the same
    // question the list answers — what should it say — so it belongs in the same control, and a
    // front door with one fewer button is a front door with one fewer thing to explain.
    if (o.onCustom) {
      const c = document.createElement('option');
      c.value = '__custom'; c.textContent = 'Write your own\u2026';
      pSel.appendChild(c);
    }
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

    let lastPick = '';
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
    pSel.addEventListener('change', () => {
      if (pSel.value === '__custom') {
        // put the list back where it was before opening the editor, so closing it without
        // typing anything leaves the page saying what it was saying
        pSel.value = lastPick;
        if (o.onCustom) o.onCustom();
        return;
      }
      lastPick = pSel.value;
      own.value = ''; say();
    });
    own.addEventListener('keydown', e => { if (e.key === 'Enter') say(); });

    return {
      el: host, voiceSel: vSel, phraseSel: pSel, input: own,
      /** what the page should say now: typed text wins over the dropdown */
      phrase: () => own.value.trim() || pSel.value,
      setVoice: k => { if (k && [...vSel.options].some(x => x.value === k)) vSel.value = k; },
      setPhrase: t => { own.value = '';
                        if ([...pSel.options].some(x => x.value === t)) { pSel.value = t; lastPick = t; }
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
      // A room may carry a marker of its own in the hash — About does. State is written onto
      // every link, and a naive rewrite dropped it, so the About link silently became a link to
      // the throat. Its own key goes back on the front.
      const mark = a.dataset && a.dataset.mark;
      a.setAttribute('href', href.split('#')[0] +
        (mark ? (tail ? tail + '&' + mark : '#' + mark) : tail));
    }
  }

  // ── THE TRACT LENGTH THE WORKLET ACTUALLY HAS ───────────────────────────
  //
  // A `voice` message does NOT resize the tract; only a `tract` message does. Build keyframes for
  // one length and hand them to a processor at another and the tail of every frame is undefined:
  // measured, a 26-section word played on a 44-section tract gives 72,064 non-finite samples.
  // NaN, and silence rather than a crash, which is the hardest kind of fault to trace.
  //
  // The bench knew this and kept a `workletN`. index.html knew it. The wizard did not, and its
  // first question changes `sect` — so the one page most likely to change tract length was the
  // one page not guarding it. Kept here so that a page cannot be written without the guard.
  let liveN = 0;
  function tractFor(node, voice, hint) {
    const P = eng();
    const want = Math.max(14, Math.min(72, Math.round((voice && voice.sect) || hint || 44)));
    if (node && want !== liveN) {
      node.port.postMessage({ type: 'tract', n: want,
        diam: P.articulate((voice && voice.art && voice.art['ə']) || P.ART['ə'], want) });
      liveN = want;
    }
    return want;
  }

  // ── ONE WAY BETWEEN THE ROOMS ───────────────────────────────────────────
  //
  // Three pages had three navigations: index offered "Make a voice · Bench · About", the wizard
  // offered "Back · Bench", and THE BENCH OFFERED NOTHING AT ALL — a page you could reach and
  // not leave. "Back" did not say where it went and "Bench" did not say what it was.
  //
  // One list, named by what the room is for rather than by what it is called internally, and the
  // page you are on is marked rather than omitted — a navigation that hides the current page
  // makes every page look like a different app.
  const ROOMS = [
    { href: 'index.html',     name: 'Throat',       why: 'watch it speak' },
    { href: 'wizard.html',    name: 'Make a voice', why: 'four questions and a walk' },
    { href: 'lab/bench.html', name: 'Lab',          why: 'the workbench: sweeps, pairs, every knob' },
    // About is a room too, and was a button sitting outside the nav pretending not to be one.
    // It lives as a dialog on the throat page rather than as a file, so the room is a MARKER in
    // the hash: every page links to it, index opens it on arrival, and it is shareable like any
    // other state. `mark` is what carryState has to preserve — see there.
    { href: 'index.html',     name: 'About',        why: 'what this is and why', mark: 'about' },
  ];

  /** Render the navigation into an element. `here` is the file this page is, so it can mark
   *  itself; the links carry voice and phrase, which is what makes the three feel like one. */
  /** The navigation's own stylesheet, injected once.
   *
   *  It used to render elements classed `btn` and rely on each page having a compatible rule for
   *  that. index.html did. The wizard's was a different size. THE BENCH HAD NO `.btn` RULE AT
   *  ALL, so the nav arrived there as three words of bare text — which is exactly the failure a
   *  shared component is supposed to make impossible.
   *
   *  Its own class names now, so a page cannot style it wrong by accident or leave it unstyled
   *  by omission. Colours come from --hot where a page has declared it and fall back where it
   *  has not. */
  function navStyle() {
    if (document.getElementById('hb-nav-css')) return;
    const st = document.createElement('style');
    st.id = 'hb-nav-css';
    st.textContent = [
      '.hb-nav{display:flex;gap:.4rem;align-items:center;flex-wrap:nowrap;overflow-x:auto;',
      '  scrollbar-width:none}',
      '.hb-nav::-webkit-scrollbar{display:none}',
      '.hb-room{flex:0 0 auto;display:inline-block;text-decoration:none;white-space:nowrap;',
      '  font:500 .86rem/1 var(--sans,system-ui),system-ui;padding:.44rem .7rem;border-radius:7px;',
      '  border:1px solid var(--line,#4c575e);color:var(--ink,#f1f5f7);background:transparent;',
      '  cursor:pointer}',
      '.hb-room:hover{border-color:var(--hot,#ff8a4c)}',
      '.hb-room.here{background:var(--hot,#ff8a4c);border-color:var(--hot,#ff8a4c);',
      '  color:var(--hot-ink,#160a03);font-weight:600;cursor:default}',
    ].join('');
    document.head.appendChild(st);
  }

  function mountNav(el, here, state) {
    const host = typeof el === 'string' ? document.getElementById(el) : el;
    if (!host) return null;
    navStyle();
    host.className = 'hb-nav';
    // depth matters: lab/bench.html has to climb out to reach the other two
    const up = /\//.test(here) ? '../' : '';
    host.innerHTML = '';
    for (const r of ROOMS) {
      // A marker room is never "here": About is a thing you open, not a place you are, and
      // marking it current on the page it opens over would be a lie.
      const mine = !r.mark && r.href.replace(/^.*\//, '') === here.replace(/^.*\//, '');
      const a = document.createElement(mine ? 'span' : 'a');
      a.className = 'hb-room' + (mine ? ' here' : '') + (r.quiet ? ' quiet' : '');
      a.textContent = r.name;
      a.title = r.why;
      if (!mine) a.setAttribute('href', up + r.href + (r.mark ? '#' + r.mark : ''));
      if (r.mark) a.dataset.mark = r.mark;
      host.appendChild(a);
    }
    if (state) carryState(state);
    return host;
  }

  // ── A PHRASE MENU, NOT A DROPDOWN ───────────────────────────────────────
  //
  // A native <select> renders on a phone as a full-screen list of radio buttons with nothing but
  // the text — which throws away the `why` on every entry, the grouping, and any hope of putting
  // "write your own" somewhere it reads as an action rather than as another thing to be.
  //
  // This is a sheet: the phrases with what each is for underneath, grouped, and writing your own
  // at the top where it belongs. It closes on a pick, on the backdrop, and on Escape.
  function phraseMenu(opts) {
    const o = opts || {};
    const back = document.createElement('div');
    back.className = 'hb-sheet-back';
    const sheet = document.createElement('div');
    sheet.className = 'hb-sheet';
    back.appendChild(sheet);

    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', e => { if (e.target === back) close(); });

    if (o.onCustom) {
      const b = document.createElement('button');
      b.className = 'hb-row hb-row-action';
      b.innerHTML = '<b>Write your own</b><small>type anything and hear it</small>';
      b.addEventListener('click', () => { close(); o.onCustom(); });
      sheet.appendChild(b);
    }

    let last = '';
    for (const ph of PHRASES) {
      if (o.kinds && !o.kinds.includes(ph.kind)) continue;
      if (ph.kind !== last) {
        const h = document.createElement('div');
        h.className = 'hb-head';
        h.textContent = ph.kind === 'probe' ? 'Test phrases' : 'Passages';
        sheet.appendChild(h);
        last = ph.kind;
      }
      const b = document.createElement('button');
      b.className = 'hb-row' + (ph.text === o.current ? ' on' : '');
      // the probe's own text is the point; a passage is known by who wrote it
      const title = ph.kind === 'probe' ? ph.text : ph.why;
      const note  = ph.kind === 'probe' ? ph.why  : ph.text;
      b.innerHTML = '<b></b><small></small>';
      b.firstChild.textContent = title;
      b.lastChild.textContent = note;
      b.addEventListener('click', () => { close(); if (o.onPick) o.onPick(ph.text); });
      sheet.appendChild(b);
    }
    document.body.appendChild(back);
    return { close };
  }

  /** The stylesheet the menu needs, injected once. A page should not have to paste this in to
   *  use a shared component, and three pages pasting it is three copies to drift. */
  function menuStyle() {
    if (document.getElementById('hb-sheet-css')) return;
    const st = document.createElement('style');
    st.id = 'hb-sheet-css';
    st.textContent = [
      '.hb-sheet-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;',
      '  display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px)}',
      '.hb-sheet{background:#171c20;border:1px solid #2f373d;border-radius:14px 14px 0 0;',
      '  width:min(34rem,100%);max-height:78vh;overflow:auto;padding:.5rem 0 1.2rem;',
      '  box-shadow:0 -8px 40px rgba(0,0,0,.5)}',
      '.hb-head{font:600 .72rem/1.6 ui-monospace,monospace;letter-spacing:.08em;',
      '  text-transform:uppercase;color:#8b969c;padding:.9rem 1.1rem .3rem}',
      '.hb-row{display:block;width:100%;text-align:left;background:none;border:0;',
      '  color:#f1f5f7;padding:.62rem 1.1rem;cursor:pointer;font:inherit}',
      '.hb-row:hover,.hb-row:focus{background:#212930;outline:none}',
      '.hb-row:focus-visible{box-shadow:inset 3px 0 0 #ff8a4c}',
      '.hb-row b{display:block;font-weight:600;font-size:.98rem}',
      '.hb-row small{display:block;color:#8b969c;font:.76rem/1.45 ui-monospace,monospace;',
      '  margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // The accent, spelled out rather than read from a variable: this stylesheet is injected
      // into whichever page asks, and a page that has not declared --hot would get nothing.
      // filled, not tinted: an orange word on an orange wash is the thing that did not pop
      '.hb-row.on{background:#ff8a4c}',
      '.hb-row.on b,.hb-row.on small{color:#160a03}',
      '.hb-row.on b:after{content:" \\2713"}',
      '.hb-row-action{border-bottom:1px solid #2f373d;margin-bottom:.2rem}',
      '.hb-row-action b{color:#ff8a4c}',
      '.hb-row-foot{border-top:1px solid #2f373d;border-bottom:0;margin:.3rem 0 0}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── THE SAME SHEET, FOR VOICES ──────────────────────────────────────────
  //
  // Every voice carries a label and a note explaining what it is — "a shorter tract lifts every
  // formant, that and not pitch is what makes it sound like a woman", "same voice, same pitch,
  // sound just travels faster". A native <select> shows none of that. It is the most interesting
  // writing in the project and it was invisible.
  //
  // `Advanced` lives at the bottom of this sheet rather than in the dock. Tuning a voice is the
  // last thing you do to a voice, so it belongs where the voices are — and the front door is two
  // buttons lighter for it.
  function voiceMenu(opts) {
    const o = opts || {};
    const P = eng();
    const back = document.createElement('div');
    back.className = 'hb-sheet-back';
    const sheet = document.createElement('div');
    sheet.className = 'hb-sheet';
    back.appendChild(sheet);

    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', e => { if (e.target === back) close(); });

    const h = document.createElement('div');
    h.className = 'hb-head'; h.textContent = 'Voices';
    sheet.appendChild(h);

    for (const k of Object.keys(P.VOICES)) {
      if (o.skip && o.skip.includes(k)) continue;
      const V = P.VOICES[k];
      const b = document.createElement('button');
      b.className = 'hb-row' + (k === o.current ? ' on' : '');
      b.innerHTML = '<b></b><small></small>';
      b.firstChild.textContent = V.label || k;
      b.lastChild.textContent = V.note || '';
      b.addEventListener('click', () => { close(); if (o.onPick) o.onPick(k); });
      sheet.appendChild(b);
    }

    if (o.onAdvanced) {
      const b = document.createElement('button');
      b.className = 'hb-row hb-row-action hb-row-foot';
      b.innerHTML = '<b>Advanced\u2026</b><small>every knob, one at a time</small>';
      b.addEventListener('click', () => { close(); o.onAdvanced(); });
      sheet.appendChild(b);
    }

    document.body.appendChild(back);
    return { close };
  }

  root.HOLLER_SESSION = { planWord, planSpeech, chainFor, loadEngine, startAudio, tractFor,
                          voiceMenu, navStyle,
                          phraseMenu, menuStyle,
                          ROOMS, mountNav,
                          PHRASES, mountSelector, readURL, writeURL, carryState };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (globalThis.HOLLER_SESSION);
}
