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
// TWO TRACKS, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.
//
// `--actual` was added because the default track is not what the engine speaks with. `buildWord`
// emits six articulators AND the diameters `articulate` makes from them; they agree at the
// keyframes and nowhere else. Between keyframes the worklet runs a critically damped follower over
// the DIAMETERS, per section, while these six are smoothstepped with no mass at all. So `artT`,
// `artCrit`, `artStiff`, `artPush`, `artFar` and `velT` — every gesture parameter there is — move
// the tube and leave these columns exactly where they were. ROADMAP.md says as much at line 1623.
// Fitting measured articulography against the plan alone would fit a quantity no control parameter
// can reach.
//
// `--actual` traces the running worklet and reads each frame back into posture coordinates via
// `lab/artspace.js`. Measured on "the quick brown fox…", voice john: 20.5% of frames sit in a tract
// shape no posture reaches at artT=0, and 64.5% at artT=0.020. Transitions are interpolated in AREA
// space, so the tract passes through shapes no tongue could hold — before any mass is added, and
// three times more once it is.
//
// It costs what it costs: planning is 0.55 ms an utterance and tracing is 1042 ms, a factor of
// 1895. The header used to quote 2.17 ms as though that covered the whole job. It covers the plan.
//
//   node lab/trajectories.js --in utterances.txt --out tracks.csv [--voice john] [--rate 200]
//   node lab/trajectories.js --in utterances.txt --out tracks.csv --actual
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

// Pairs, except for bare flags — `--actual` used to eat the next argument as its value and then
// silently drop it, which is the kind of thing that produces a corpus pass against the wrong voice.
const BOOL = new Set(['actual']);
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  args[k] = BOOL.has(k) ? true : process.argv[++i];
}

const IN     = args.in;
const OUT    = args.out || 'tracks.csv';
const VOICE  = args.voice || 'john';
const RATE   = +(args.rate || 200);         // frames a second; EMA is commonly 100 to 500 Hz
const ACTUAL = !!args.actual;

if (!IN) {
  console.error('usage: node lab/trajectories.js --in utterances.txt --out tracks.csv [--voice john] [--rate 200] [--actual]');
  process.exit(2);
}
if (!P.VOICES[VOICE]) {
  console.error('no such voice: ' + VOICE + '. have: ' + Object.keys(P.VOICES).join(' '));
  process.exit(2);
}

const v = { ...P.defaultVoice(), ...(P.VOICES[VOICE].v || {}) };

// --set artT=0.03,artStiff=0.30
//
// The fitter has to be able to move the parameters, and it drives this file from Python. Every key
// is checked against VOICE_SPEC and every value against that parameter's own range, because a typo
// that silently did nothing would show up downstream as "the parameter has no effect", which is
// precisely the conclusion this whole exercise exists to draw honestly.
if (args.set) {
  for (const pair of String(args.set).split(',')) {
    const [k, raw] = pair.split('=');
    const spec = P.VOICE_SPEC.find(p => p.k === k);
    if (!spec) { console.error(`--set: no such parameter "${k}"`); process.exit(2); }
    const x = Number(raw);
    if (!Number.isFinite(x)) { console.error(`--set ${k}: "${raw}" is not a number`); process.exit(2); }
    if (x < spec.lo || x > spec.hi) {
      console.error(`--set ${k}=${x} is outside [${spec.lo}, ${spec.hi}]`); process.exit(2);
    }
    v[k] = x;
  }
}

const n = Math.round(v.sect);
const ARTS = ['jaw', 'bodyPos', 'bodyHi', 'tipPos', 'tipHi', 'lip'];

/** The articulator values at time t, interpolated between keyframes exactly as the page does when
 *  it draws the tract. Same smoothstep as `index.html`'s `artNow`, so this is precisely what is
 *  SEEN. It is not what is heard: the worklet interpolates the diameters and then runs a follower
 *  over them, and nothing makes the two agree. Use `--actual` for the one the tube uses. */
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

// Required only for --actual, because loading the harness evals the whole engine and the plan-only
// path is meant to stay in the tens of milliseconds.
const H  = ACTUAL ? require(path.join(__dirname, 'harness.js')) : null;
const AS = ACTUAL ? require(path.join(__dirname, 'artspace.js')) : null;

/**
 * What the tract ACTUALLY did, read back as a posture, sampled at the output frame rate.
 *
 * The follower runs per section at the audio rate; we only need it at EMA rates, so the trace is
 * decimated to `RATE` before inverting — the inversion is the expensive half and there is no point
 * running it 344 times a second to emit 200.
 *
 * Warm-started off the previous frame, with a re-grid only when a frame fits much worse than the
 * ones around it. That is not only for speed: several postures make the same tract shape, so an
 * independent cold search per frame is free to land on a different equivalent branch each time,
 * and the resulting jitter shows up as articulator VELOCITY that the engine never had.
 */
function actualTrack(W, stress) {
  // artOnly: the tract still moves, nothing is synthesised. Bit-identical diameters, and the
  // acoustics were most of the bill.
  const p = H.makeProcessor(n, { artOnly: true });
  p.port.onmessage({ data: { type: 'voice', v } });
  p.port.onmessage({ data: { type: 'goal',
    seq: { keys: W.keys, f0: P.buildF0(W.end, v, { stress, seg: W.seg }), end: W.end } } });

  const out = [new Float32Array(128)];
  const blocks = Math.ceil(W.end * H.SR / 128);
  const every = Math.max(1, Math.round(H.SR / 128 / RATE));
  const track = [];
  let prev = null, runMed = 0.02;

  for (let b = 0; b < blocks; b++) {
    p.process([], [out]);
    if (b % every) continue;
    const tol = Math.max(0.004, runMed * 3);
    const got = AS.fit(p.diam.subarray(0, n), n, { from: prev, warmTol: tol });
    runMed = runMed * 0.98 + got.rms * 0.02;
    prev = got.A;
    track.push({ t: b * 128 / H.SR, A: got.A, rms: got.rms, clamped: got.clamped });
  }
  return track;
}

/** Nearest traced frame to t. The trace is on the audio block grid and the CSV is on the requested
 *  frame grid; they are close but not identical, and interpolating a projection would be inventing
 *  precision the inversion does not have. */
function nearest(track, t) {
  if (!track.length) return null;
  let lo = 0, hi = track.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (track[m].t < t) lo = m + 1; else hi = m; }
  if (lo > 0 && Math.abs(track[lo - 1].t - t) < Math.abs(track[lo].t - t)) lo--;
  return track[lo];
}

const lines = fs.readFileSync(IN, 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const out = [];
out.push([...['utt','t','jaw','bodyPos','bodyHi','tipPos','tipHi','lip'],
          ...(ACTUAL ? ARTS.map(k => 'act_' + k).concat(['inv_rms','clamped']) : []),
          ...['phone','phone_i','pos_in_seg','stress','word_i','in_word',
              'utt_pos','seg_dur','n_phones']].join(','));

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

  const track = ACTUAL ? actualTrack(W, r.stress) : null;

  const step = 1 / RATE;
  for (let t = 0; t <= W.end; t += step) {
    const A = artAt(W.art, t);
    if (!A) break;
    const act = ACTUAL ? nearest(track, t) : null;
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
      ...(ACTUAL ? (act ? ARTS.map(k => act.A[k].toFixed(5))
                            .concat([act.rms.toFixed(5), act.clamped.toFixed(4)])
                        : ARTS.map(() => '').concat(['', '']))
                 : []),
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
