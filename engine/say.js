// ── ONE SPEAK PATH ────────────────────────────────────────────────────────
//
// Three pages used to hold their own copy of this, written at different times, and they had
// drifted. Measured before this file existed:
//
//                                          index   wizard   bench
//   applies a voice's fitted postures        yes      NO      yes
//   clamps duration at 5 seconds             YES      no      no
//   passes `open`                             no      no      YES
//
// Neither consequence was subtle. `johnfit` carries 26 fitted postures that the wizard never
// applied, so a fitted voice was spoken there with somebody else's tongue. And the Austen
// passage ran 6.62 s on the main page against 8.77 s on the other two — the same text, 1.32
// times longer on one page than another, because the main page's clamp existed to match a
// slider that the other two do not have.
//
// Every bug of the "the voice got lost" or "the phrase stopped working" kind lived in that gap.
// There was no shared definition of what saying something MEANS, so each page invented one.
//
// This is that definition. A view decides WHAT to say and in what voice; this decides what
// that means. The five-second clamp is deliberately not here: a ceiling that exists to match a
// slider's range belongs to the slider.
(function (root) {
  'use strict';

  const P = () => root.HOLLER;

  /** How long a chain wants to be, before any view stretches it.
   *
   *  `per` is seconds per sound and lives in the voice, so a drawn-out preset is drawn out
   *  here rather than by each page remembering to multiply. */
  function naturalD(chain, voice) {
    const per = (voice && voice.per) || 0.17;
    return Math.max(0.35, chain.length * per);
  }

  /** Everything the worklet needs to say a chain: the keyframes, the pitch track, the length.
   *
   *  `D` is optional and defaults to naturalD. A page with a duration slider passes its own;
   *  a page without one should not have to know that a default exists.
   *
   *  `art` falls back to the voice's own postures. The wizard omitted this and spoke fitted
   *  voices with generic ones, which is the single largest divergence this file removes. */
  function plan(chain, voice, opts) {
    const o = opts || {};
    const H = P();
    if (!H) throw new Error('HOLLER_SAY: the engine is not loaded');
    const n = o.n || Math.round(voice.sect || 44);
    const D = o.D === undefined ? naturalD(chain, voice) : o.D;
    const stress = o.stress || null;
    const art = o.art !== undefined ? o.art : (voice.art || null);

    const W = H.buildWord(chain, {
      D,
      rate: H.rateFor(chain, D, voice),
      drawl: voice.drawl,
      glide: voice.glide,
      stopHold: voice.stopT,
      open: voice.open || 0,
      n, art, stress,
      pros: voice,
    });
    return {
      keys: W.keys,
      seg: W.seg,
      art: W.art,
      end: W.end,
      f0: H.buildF0(W.end, voice, { stress, seg: W.seg }),
      D, n,
    };
  }

  /** The same, from text rather than from a chain of symbols.
   *
   *  Returns null when the speller is absent, which is a real state: the bench boots without it
   *  on purpose so that a missing spelling.js darkens one tab instead of failing to start. */
  function planText(text, voice, opts) {
    const S = root.HOLLER_SPELL;
    if (!S) return null;
    const r = S.g2p(String(text || ''));
    if (!r.ph.length) return null;
    const out = plan(r.ph, voice, { ...(opts || {}), stress: r.stress });
    out.chain = r.ph;
    out.stress = r.stress;
    return out;
  }

  root.HOLLER_SAY = { plan, planText, naturalD };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.HOLLER_SAY;
