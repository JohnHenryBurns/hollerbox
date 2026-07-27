#!/usr/bin/env node
//
// TRAJECTORIES OUT, ONE ROW PER FRAME.
//
// Emits the model's articulator track for a list of utterances, as CSV, for fitting against
// measured articulography in Python.
//
// WHY NODE AND NOT A PYTHON PORT. The engine is the thing being tested, and a second
// implementation of it would drift from the first — which is the exact class of fault this
// project spent a week removing: three speak paths, three loaders, a check asserting where code
// used to live. A ported engine would be that permanently, with the added hazard that the model
// being fitted is not the model anyone has listened to. Python does the fitting and the
// statistics, which is what it is good at. The trajectories come from here.
//
// It renders no audio. Fitting compares trajectories, and skipping the acoustics is what makes a
// pass over a whole corpus cost seconds rather than hours — measured at 2.17 ms an utterance.
//
//   node lab/trajectories.js --in utterances.txt --out tracks.csv [--voice john] [--rate 200]
//
// Input: one utterance per line. Blank lines and lines beginning # are ignored.
//        A line may be "id<TAB>text" to carry the corpus's own identifier through.
//
// Output columns, and the reason for each:
//
//   utt          the corpus identifier, so rows can be joined back to the measured data
//   t            seconds from the start of the utterance
//   jaw bodyPos bodyHi tipPos tipHi lip
//                the six articulators, interpolated to the frame rate
//   phone        the segment sounding at this frame, or "" in a gap
//   phone_i      its index in the utterance, so segments can be grouped without string matching
//   pos_in_seg   0 at the segment's start, 1 at its end — the within-segment clock, which is what
//                undershoot and target-approach are functions of
//   stress       1 if this segment carries lexical stress, else 0
//   word_i       which word, counting from 0
//   in_word      0 at the word's start, 1 at its end
//   utt_pos      0 at the utterance's start, 1 at its end — phrase-final lengthening lives here
//   seg_dur      the segment's duration in seconds
//   n_phones     how many sounds in the utterance, because duration is a function of it
//
// The last six exist so that stage 2 can regress the residual against them WITHOUT having to
// reconstruct the linguistic context from the audio. If a control principle turns out to depend
// on something not in this list, add it here rather than deriving it downstream, so that the
// derivation is in one place and is versioned with the engine.

const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'engine', 'phonemes.js'));
const S = require(path.join(__dirname, '..', 'engine', 'spelling.js'));

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const IN    = args.in;
const OUT   = args.out || 'tracks.csv';
const VOICE = args.voice || 'john';
const RATE  = +(args.rate || 200);          // frames a second; EMA is commonly 100 to 500 Hz

if (!IN) {
  console.error('usage: node lab/trajectories.js --in utterances.txt --out tracks.csv [--voice john] [--rate 200]');
  process.exit(2);
}
if (!P.VOICES[VOICE]) {
  console.error('no such voice: ' + VOICE + '. have: ' + Object.keys(P.VOICES).join(' '));
  process.exit(2);
}

const v = { ...P.defaultVoice(), ...(P.VOICES[VOICE].v || {}) };
const n = Math.round(v.sect);
const ARTS = ['jaw', 'bodyPos', 'bodyHi', 'tipPos', 'tipHi', 'lip'];

/** The articulator values at time t, interpolated between keyframes exactly as the page does when
 *  it draws the tract. Same smoothstep, so what is fitted is what is seen and heard. */
function artAt(keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return keys[0].A;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      let u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      u = u * u * (3 - 2 * u);
      const o = {};
      for (const k of ARTS) o[k] = a.A[k] + (b.A[k] - a.A[k]) * u;
      return o;
    }
  }
  return keys[keys.length - 1].A;
}

const lines = fs.readFileSync(IN, 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const out = [];
out.push(['utt','t','jaw','bodyPos','bodyHi','tipPos','tipHi','lip',
          'phone','phone_i','pos_in_seg','stress','word_i','in_word',
          'utt_pos','seg_dur','n_phones'].join(','));

let utts = 0, frames = 0, skipped = 0;
const t0 = Date.now();

for (const line of lines) {
  const tab = line.indexOf('\t');
  const id   = tab > 0 ? line.slice(0, tab) : 'u' + utts;
  const text = tab > 0 ? line.slice(tab + 1) : line;

  let r;
  try { r = S.g2p(text); } catch (e) { skipped++; continue; }
  if (!r.ph.length) { skipped++; continue; }

  const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n, stress: r.stress, pros: v,
                                glide: v.glide, stopHold: v.stopT, drawl: v.drawl });

  // word index per segment: a gap ends a word
  const wordOf = [], wordSpan = [];
  { let w = 0, started = false;
    for (let i = 0; i < W.seg.length; i++) {
      const sym = W.seg[i].sym;
      if (sym === ' ' || String(sym).slice(0, 3) === 'brk') { if (started) { w++; started = false; } wordOf[i] = -1; }
      else { wordOf[i] = w; started = true;
             if (!wordSpan[w]) wordSpan[w] = { a: W.seg[i].a, b: W.seg[i].b };
             else wordSpan[w].b = W.seg[i].b; }
    }
  }

  const step = 1 / RATE;
  for (let t = 0; t <= W.end; t += step) {
    const A = artAt(W.art, t);
    if (!A) break;
    let si = -1;
    for (let i = 0; i < W.seg.length; i++) if (t >= W.seg[i].a && t <= W.seg[i].b) { si = i; break; }
    const sg = si >= 0 ? W.seg[si] : null;
    const sym = sg && sg.sym !== ' ' && String(sg.sym).slice(0, 3) !== 'brk' ? sg.sym : '';
    const dur = sg ? sg.b - sg.a : 0;
    const inSeg = sg && dur > 0 ? (t - sg.a) / dur : '';
    const wi = si >= 0 ? wordOf[si] : -1;
    const ws = wi >= 0 ? wordSpan[wi] : null;
    const inWord = ws && ws.b > ws.a ? (t - ws.a) / (ws.b - ws.a) : '';
    // stress is parallel to the phone list, so index into it by the segment's own position
    const stress = sym && r.stress ? (r.stress[si] ? 1 : 0) : 0;

    out.push([
      id, t.toFixed(5),
      ...ARTS.map(k => A[k].toFixed(5)),
      sym, si, inSeg === '' ? '' : (+inSeg).toFixed(4), stress,
      wi, inWord === '' ? '' : (+inWord).toFixed(4),
      (t / W.end).toFixed(4), dur.toFixed(5), r.ph.length,
    ].join(','));
    frames++;
  }
  utts++;
}

fs.writeFileSync(OUT, out.join('\n') + '\n');
const ms = Date.now() - t0;
console.error(`${utts} utterances, ${frames} frames -> ${OUT}` +
              (skipped ? `  (${skipped} skipped)` : '') +
              `   ${ms} ms, ${(ms / Math.max(1, utts)).toFixed(2)} ms an utterance`);
