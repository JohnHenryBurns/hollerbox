#!/usr/bin/env node
//
// THE BENCH PHRASES, RENDERED TO WAV, FOR AN EAR.
//
// RESEARCH.md stage 2.5: take the parameters fitted to human trajectories, render the bench phrases,
// and listen. Nothing here measures anything. It writes files a person can play, named so that
// what differs between them is in the name.
//
//   node lab/listen.js --voice mngu0 --out research/out/listen --tag before
//   node lab/listen.js --voice mngu0 --art research/out/mri/speaker_solved.json --tag mri
//   node lab/listen.js --voice mngu0 --art ... --set artT=0,artCrit=3.2,artStiff=0.235,artPush=0.15,artFar=1.4,glide=0.128 --tag mri-fitted
//
// --art lays a posture file over the voice's own table; --set overrides voice parameters, checked
// against VOICE_SPEC like trajectories.js does. The phrases are the lab's bench set.

const fs = require('fs');
const path = require('path');
const H = require(path.join(__dirname, 'harness.js'));
const S = require(path.join(__dirname, '..', 'engine', 'spelling.js'));
const P = H.P;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true;
}
const VOICE = args.voice || 'john';
const OUT = args.out || path.join(__dirname, '..', 'research', 'out', 'listen');
const TAG = args.tag || VOICE;
if (!P.VOICES[VOICE]) { console.error('no such voice ' + VOICE); process.exit(2); }

const v = { ...P.defaultVoice(), ...(P.VOICES[VOICE].v || {}) };
if (args.set) for (const pair of String(args.set).split(',')) {
  const [k, raw] = pair.split('=');
  const spec = P.VOICE_SPEC.find(p => p.k === k);
  if (!spec) { console.error(`--set: no such parameter "${k}"`); process.exit(2); }
  const x = Number(raw);
  if (!Number.isFinite(x) || x < spec.lo || x > spec.hi) { console.error(`--set ${k}=${raw} outside [${spec.lo}, ${spec.hi}]`); process.exit(2); }
  v[k] = x;
}
let art = P.VOICES[VOICE].art || null;
if (args.art) art = { ...(art || {}), ...JSON.parse(fs.readFileSync(String(args.art), 'utf8').replace(/^﻿/, '')) };

const PHRASES = [
  'hello world', 'I love my daughter', 'my wife is great',
  'the quick brown fox jumps over the lazy dog', 'she sells sea shells',
  'I said bad and bat', 'cap captain captaincy', 'good king kenneth kicked the cat',
];

function wav(buf, sr) {
  // 16-bit mono PCM; the engine's own peak is left where outGain put it, only clipped
  const n = buf.length, out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const n = Math.round(v.sect);
for (const text of PHRASES) {
  const r = S.g2p(text);
  const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
  H.setSeed && H.setSeed(H.BASE_SEED);
  const { buf } = H.say(r.ph, { D, voice: v, n, stress: r.stress, art, extra: 0.4 });
  let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const slug = text.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(OUT, `${TAG}_${slug}.wav`);
  fs.writeFileSync(file, wav(buf, H.SR));
  console.log(`${path.basename(file).padEnd(60)} ${(buf.length / H.SR).toFixed(2)} s  peak ${(20 * Math.log10(peak + 1e-9)).toFixed(1)} dBFS`);
}
