#!/usr/bin/env node
//
// THE FORWARD MAP, AS A COMMAND.
//
// Python must never carry its own copy of `articulate` — `research/README.md` says why at length,
// and `lab/README.md` records the fault being removed three times over. But stage 0 of RESEARCH.md
// needs to push measured postures through the engine's forward map thousands of times and compare
// the diameters, and shelling out to `trajectories.js` for that would build a whole word each time.
//
// So this is the smallest possible seam: postures in, diameters out, both as JSON, over stdin and
// stdout. The map is `phonemes.js`'s own `articulate`, called directly. There is nothing else here
// to drift.
//
//   node lab/posture.js --art                      the posture table, as JSON
//   node lab/posture.js --articulate [--n 44]      stdin: JSON — an object {id: A} or a list [A, ...]
//                                                  stdout: the same shape, each A replaced by its
//                                                  diameter array
//   node lab/posture.js --formants  [--n 44]       the same, but each posture replaced by its first
//                                                  three formants from the transfer function, via
//                                                  the harness. Slower; loads the whole engine.
//
// A is {jaw, bodyPos, bodyHi, tipPos, tipHi, lip}, each in [0, 1]. Values outside are clamped and
// reported on stderr, because a registration that produces them is telling you something.

const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'engine', 'phonemes.js'));

const ARTS = ['jaw', 'bodyPos', 'bodyHi', 'tipPos', 'tipHi', 'lip'];

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith('--') ? process.argv[++i] : true;
}
const n = Math.round(+(args.n || 44));

if (args.art) {
  process.stdout.write(JSON.stringify({ arts: ARTS, vowels: P.VOWEL_KEYS, art: P.ART }) + '\n');
  process.exit(0);
}

if (!args.articulate && !args.formants) {
  console.error('usage: node lab/posture.js --art | --articulate [--n 44] | --formants [--n 44]   (postures on stdin)');
  process.exit(2);
}

// PowerShell puts a byte-order mark on piped text; JSON.parse does not forgive it.
const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
const isList = Array.isArray(input);
const entries = isList ? input.map((A, i) => [String(i), A]) : Object.entries(input);

let clamped = 0;
function clean(A) {
  const o = {};
  for (const k of ARTS) {
    let x = +A[k];
    if (!Number.isFinite(x)) throw new Error('posture is missing ' + k);
    if (x < 0 || x > 1) { clamped++; x = x < 0 ? 0 : 1; }
    o[k] = x;
  }
  return o;
}

let H = null;
if (args.formants) H = require(path.join(__dirname, 'harness.js'));

const out = isList ? [] : {};
for (const [id, A] of entries) {
  const a = clean(A);
  let val;
  if (args.formants) {
    // the harness measures the tract's own transfer function; nothing here prescribes a formant
    val = H.formantsOfShape(P.articulate(a, n), { n });
  } else {
    val = Array.from(P.articulate(a, n)).map(x => +x.toFixed(5));
  }
  if (isList) out.push(val); else out[id] = val;
}
if (clamped) console.error(`posture.js: clamped ${clamped} parameter value(s) into [0, 1]`);
process.stdout.write(JSON.stringify(out) + '\n');
