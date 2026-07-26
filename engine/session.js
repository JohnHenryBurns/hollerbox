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
  const P = root.HOLLER;
  if (!P) throw new Error('session.js needs phonemes.js first');

  /** Every option buildWord takes, derived from the voice in one place.
   *
   *  `D` is the natural length of the chain and nothing clamps it. The 5-second ceiling that
   *  used to sit here belonged to a duration slider, and a slider is a view concern — a page
   *  that has one may pass `stretch` to scale this, and a page that does not is unaffected.  */
  function planWord(chain, voice, opts) {
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
    const o = opts || {};
    const W = planWord(chain, voice, o);
    const f0 = P.buildF0(W.end, voice || P.defaultVoice(), { stress: o.stress || null, seg: W.seg });
    return { keys: W.keys, f0, end: W.end, seg: W.seg, art: W.art, word: W };
  }

  /** Text to a chain the engine can actually say, dropping anything it has no posture for.
   *  Every page did this differently or not at all; the wizard's version was the only one that
   *  checked, which is why a passage with an unknown symbol went silent elsewhere. */
  function chainFor(text, spell) {
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

  root.HOLLER_SESSION = { planWord, planSpeech, chainFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (globalThis.HOLLER_SESSION);
}
