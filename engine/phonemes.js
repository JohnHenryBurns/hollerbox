// ─────────────────────────────────────────────────────────────────────────────
// THE PHONEME LAYER. One copy, in a file.
//
// The tract shapes, the phoneme classes, the voice table, and the articulation and
// word-building that turn them into keyframes. This used to live inside index.html, which
// meant every other consumer had to re-derive it by regex: bench.html pulled ART, VOICES,
// articulate and buildWord out of the page with fifteen regular expressions, and harness.js
// did the same and then kept its OWN near-copy of buildWord called plan() — with a comment
// admitting that "the harness having its own slightly different copy of this is exactly how
// a gate ends up testing the wrong thing". It was right. This is that fixed.
//
// It is a classic script on purpose. index.html's top-level scoping does not change: the page
// loads this first and aliases what it needs, so every existing reference still resolves.
//
//   browser   <script src="engine/phonemes.js"></script>   then use HOLLER.*
//   node      const P = require("./engine/phonemes.js")
//
// Nothing here touches the DOM, the AudioContext, or any module-level mutable state. Given the
// same arguments it returns the same thing, which is what makes it shareable.
// ─────────────────────────────────────────────────────────────────────────────
(function (root) {
'use strict';

// ---- the solved tract shapes ----
// Positions are normalised (0 = glottis, 1 = lips) so they survive any sample rate.
const ART = {
 "i": {
  "jaw": 0.133,
  "bodyPos": 0.61,
  "bodyHi": 0.67,
  "tipPos": 0.88,
  "tipHi": 0.25,
  "lip": 0.65
 },
 "ɪ": {
  "jaw": 0.722,
  "bodyPos": 0.652,
  "bodyHi": 0.924,
  "tipPos": 0.807,
  "tipHi": 0.131,
  "lip": 0.789
 },
 "ɛ": {
  "jaw": 0.756,
  "bodyPos": 0.638,
  "bodyHi": 0.692,
  "tipPos": 0.904,
  "tipHi": 0.086,
  "lip": 0.966
 },
 "æ": {
  "jaw": 0.99,
  "bodyPos": 0.643,
  "bodyHi": 0.472,
  "tipPos": 0.742,
  "tipHi": 0.07,
  "lip": 0.879
 },
 "ʌ": {
  "jaw": 0.719,
  "bodyPos": 0.388,
  "bodyHi": 0.308,
  "tipPos": 0.731,
  "tipHi": 0.294,
  "lip": 0.646
 },
 "ɑ": {
  "jaw": 0.847,
  "bodyPos": 0.301,
  "bodyHi": 0.409,
  "tipPos": 0.817,
  "tipHi": 0.059,
  "lip": 0.889
 },
 "ɔ": {
  "jaw": 0.795,
  "bodyPos": 0.286,
  "bodyHi": 0.482,
  "tipPos": 0.84,
  "tipHi": 0.019,
  "lip": 0.438
 },
 "ʊ": {
  "jaw": 0.94,
  "bodyPos": 0.487,
  "bodyHi": 0.339,
  "tipPos": 0.84,
  "tipHi": 0.081,
  "lip": 0.304
 },
 "u": {
  "jaw": 0.651,
  "bodyPos": 0.493,
  "bodyHi": 0.451,
  "tipPos": 0.84,
  "tipHi": 0.037,
  "lip": 0.178
 },
 "ɝ": {
  "jaw": 0.958,
  "bodyPos": 0.829,
  "bodyHi": 0.33,
  "tipPos": 0.79,
  "tipHi": 0.215,
  "lip": 0.405
 },
 "ə": {
  "jaw": 0.065,
  "bodyPos": 0.638,
  "bodyHi": 0.106,
  "tipPos": 0.936,
  "tipHi": 0.198,
  "lip": 0.714
 },
 "o": {
  "jaw": 0.715,
  "bodyPos": 0.475,
  "bodyHi": 0.584,
  "tipPos": 0.84,
  "tipHi": 0.057,
  "lip": 0.374
 },
 "b": {
  "jaw": 0.25,
  "bodyPos": 0.3,
  "bodyHi": 0.1,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.0
 },
 "d": {
  "jaw": 0.3,
  "bodyPos": 0.55,
  "bodyHi": 0.25,
  "tipPos": 0.83,
  "tipHi": 1.0,
  "lip": 0.765
 },
 "g": {
  "jaw": 0.28,
  "bodyPos": 0.56,
  "bodyHi": 1.0,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.737
 },
 "l": {
  "jaw": 0.45,
  "bodyPos": 0.3,
  "bodyHi": 0.18,
  "tipPos": 0.84,
  "tipHi": 0.72,
  "lip": 0.812
 },
 "m": {
  "jaw": 0.25,
  "bodyPos": 0.3,
  "bodyHi": 0.1,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.0
 },
 "n": {
  "jaw": 0.3,
  "bodyPos": 0.55,
  "bodyHi": 0.25,
  "tipPos": 0.83,
  "tipHi": 1.0,
  "lip": 0.765
 },
 "ŋ": {
  "jaw": 0.28,
  "bodyPos": 0.56,
  "bodyHi": 1.0,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.737
 },
 "p": {
  "jaw": 0.25,
  "bodyPos": 0.3,
  "bodyHi": 0.1,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.0
 },
 "t": {
  "jaw": 0.3,
  "bodyPos": 0.55,
  "bodyHi": 0.25,
  "tipPos": 0.83,
  "tipHi": 1.0,
  "lip": 0.765
 },
 "k": {
  "jaw": 0.28,
  "bodyPos": 0.56,
  "bodyHi": 1.0,
  "tipPos": 0.85,
  "tipHi": 0.0,
  "lip": 0.737
 },
 "s": {
  "jaw": 0.45,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.85,
  "tipHi": 0.85,
  "lip": 0.931
 },
 "z": {
  "jaw": 0.35,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.85,
  "tipHi": 0.85,
  "lip": 0.975
 },
 "ʃ": {
  "jaw": 0.45,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.842,
  "tipHi": 0.8,
  "lip": 0.452
 },
 "f": {
  "jaw": 0.4,
  "bodyPos": 0.35,
  "bodyHi": 0.15,
  "tipPos": 0.869,
  "tipHi": 0.1,
  "lip": 0.088
 },
 "w": {
  "jaw": 0.651,
  "bodyPos": 0.493,
  "bodyHi": 0.451,
  "tipPos": 0.84,
  "tipHi": 0.037,
  "lip": 0.154
 },
 "j": {
  "jaw": 0.133,
  "bodyPos": 0.61,
  "bodyHi": 0.67,
  "tipPos": 0.88,
  "tipHi": 0.25,
  "lip": 0.65
 },
 "r": {
  "jaw": 0.958,
  "bodyPos": 0.829,
  "bodyHi": 0.33,
  "tipPos": 0.79,
  "tipHi": 0.215,
  "lip": 0.405
 },
 "h": {
  "jaw": 0.065,
  "bodyPos": 0.638,
  "bodyHi": 0.106,
  "tipPos": 0.936,
  "tipHi": 0.198,
  "lip": 0.714
 },
 "v": {
  "jaw": 0.3,
  "bodyPos": 0.35,
  "bodyHi": 0.15,
  "tipPos": 0.86,
  "tipHi": 0,
  "lip": 0.088
 },
 "ʒ": {
  "jaw": 0.45,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.862,
  "tipHi": 0.8,
  "lip": 0.677
 },
 "θ": {
  "jaw": 0.43,
  "bodyPos": 0.5,
  "bodyHi": 0.2,
  "tipPos": 0.94,
  "tipHi": 0.86,
  "lip": 0.86
 },
 "ð": {
  "jaw": 0.38,
  "bodyPos": 0.5,
  "bodyHi": 0.2,
  "tipPos": 0.93,
  "tipHi": 0.8,
  "lip": 0.759
 }
};

// ---- the tract, shaped by things a person has ----
function restingDiam(n){
  const d=new Float64Array(n);
  for(let i=0;i<n;i++){
    const u=i/(n-1);
    d[i] = u<0.30 ? 1.45 : u<0.62 ? 1.45+(u-0.30)/0.32*0.75 : 2.20;
  }
  return d;
}
function hump(u,centre,width,height){
  const x=(u-centre)/width;
  if(Math.abs(x)>=1) return 0;
  return height*0.5*(1+Math.cos(Math.PI*x));
}
function articulate(A,n){
  const d=restingDiam(n);
  for(let i=0;i<n;i++){
    const u=i/(n-1);
    if(u>0.45) d[i]*=0.72+0.55*A.jaw;
    d[i]-=hump(u,A.bodyPos,0.30,A.bodyHi*2.05);
    d[i]-=hump(u,A.tipPos,0.085,A.tipHi*2.3);
    d[i]=Math.max(0.02,d[i]);
  }
  const lipD=0.02+2.66*A.lip;   // lip=0 must SEAL, or /b/ and /p/ leak
  for(let i=Math.floor(n*0.94);i<n;i++) d[i]=Math.min(d[i],lipD);
  d[0]=Math.min(d[0],0.8);
  return d;
}

const STOPS = { b:0.97, d:0.80, g:0.568 };   // lips · alveolar ridge · velum
const VELAR = STOPS.g;

// ---- the inventory, by class ----
const VOWEL_KEYS = ['i', 'ɪ', 'ɛ', 'æ', 'ʌ', 'ɑ', 'ɔ', 'ʊ', 'u', 'ɝ', 'ə', 'o', 'l'];
const STOP_KEYS  = ['b','d','g','p','t','k'];
const CONS_KEYS  = ['l','r','w','j','m','n','ŋ','b','d','g','p','t','k',
                    's','z','ʃ','ʒ','θ','ð','f','v','h'];
const APPROX=['l','m','n','ŋ','w','j','r'];   // sustainable consonants: short and quick
const DIPH={ 'aɪ':['ɑ','i'], 'aʊ':['ɑ','ʊ'], 'ɔɪ':['ɔ','i'], 'eɪ':['ɛ','i'], 'oʊ':['o','ʊ'] };
const BRANCHED={ l:1 };                 // /l/ opens the closed pocket at the tongue tip
const NASAL={ m:1, n:1, 'ŋ':1 };        // the velum opens the nasal tract
const VOICELESS={ p:1, t:1, k:1, s:1, 'ʃ':1, f:1, h:1, 'θ':1 };   // folds apart
const FRICATIVE={ 's':0.42, 'z':0.32, 'ʃ':1, 'ʒ':0.34, 'f':0.73, 'v':0.63, 'θ':0.16, 'ð':0.20 };
const ASPIRATE ={ h:1 };                               // turbulence at the glottis instead

const branchFor    = sym => BRANCHED[sym]  || 0;
const nasalFor     = sym => NASAL[sym]     || 0;
const voicelessFor = sym => VOICELESS[sym] || 0;
const fricFor      = sym => FRICATIVE[sym] || 0;
const aspFor       = sym => ASPIRATE[sym]  || 0;
const isPause = sym => sym === ' ';
const isDiph  = sym => !!DIPH[sym];

// ---- the voices ----
// `off` is the value at which a parameter stops doing anything — 0 for an excursion, 1 for a
// ratio. Declared HERE rather than in whatever UI happens to offer the button, because it is a
// fact about the parameter. `p8` marks the Phase 8 prosody layer, so the whole of it can be
// nulled in one action and the engine heard as it was before any of it existed.
const VOICE_SPEC=[
  {k:'rd',   lo:0.35,   hi:2.40,    d:0.80},    // LF shape: pressed <-> breathy
  {k:'press',lo:0,      hi:1,       d:0.45, off:0,},    // how much effort presses at the peak
  {k:'jit',  lo:0,      hi:3,       d:1, off:0,},       // vocal-fold irregularity
  {k:'damp', lo:0.9985, hi:0.99985, d:0.9995},  // tract losses -> formant bandwidth
  {k:'lipR', lo:-0.95,  hi:-0.62,   d:-0.85},   // radiation at the lips
  {k:'brth', lo:0,      hi:0.34,    d:0.18, off:0,},   // aspiration — the noise BETWEEN harmonics,    // aspiration
  {k:'f0a',  lo:80,     hi:330,     d:208},     // pitch: onset  (must reach a man at 110
  {k:'f0b',  lo:90,     hi:380,     d:250},     //        peak     and a child at 310)
  {k:'f0c',  lo:70,     hi:300,     d:190},     //        fall
  {k:'drawl',lo:0,      hi:1,       d:0.55, off:0,},    // how much the first vowel is stretched
  {k:'glide',lo:0.03,   hi:0.22,    d:0.085},  // transition time between sounds
  {k:'stopT',lo:0.035,  hi:0.15,    d:0.075},  // how long a stop stays sealed
  {k:'burst',lo:0.02,   hi:1.2,     d:0.16, off:0.02,},   // release strength; the seal does most of the work
  {k:'hiss', lo:0.3,    hi:2.2,     d:1.0},    // how hard fricatives hiss
  {k:'sect', lo:14,     hi:52,      d:44},     // tract length in sections (44 = 17.5 cm)
  {k:'open', lo:0,      hi:1,       d:0.05, off:0,},   // how far a held vowel opens as it is shouted
  {k:'per',  lo:0.10,   hi:0.80,    d:0.17},   // seconds per sound
  {k:'folds',lo:0,      hi:1,       d:0, off:0,},      // 0 = LF waveform, 1 = two-mass oscillator
  // ---- the prosody layer, Phase 8 ----
  // These were module constants until now, which meant the one part of the model that most
  // needs an ear could not be swept, could not be seeded and could not differ between voices.
  // Phase 1's thesis was that the first job is making evaluation cheap; this is that, applied
  // to a layer that did not exist when Phase 1 was written.
  //
  // They are SCALARS OVER THE PUBLISHED TABLES rather than the tables themselves. Twelve vowel
  // durations as twelve knobs would be a search space nobody can walk, and the question an ear
  // actually asks is not "what should /ɔ/ be" but "is the vowel-length effect too strong". So
  // 1 means the measured values and 0 means the effect is off — which makes every one of these
  // a bisection tool as well as a tuning knob: turn it to 0 and that part of Phase 8 is gone,
  // continuously, without touching the code.
  //
  // APPENDED, not inserted. Seeds are read positionally, so adding at the end leaves every
  // seed saved before today loading exactly as it did.
  {k:'vlen', lo:0,      hi:2,       d:1, off:0, p8:1,},      // intrinsic vowel length (0 = all equal)
  {k:'coda', lo:0,      hi:2,       d:1, off:0, p8:1,},      // how much a coda lengthens the vowel
  {k:'wkdur',lo:0.35,   hi:1,       d:0.60, off:1, p8:1,},   // unstressed syllable duration
  {k:'wklev',lo:0.35,   hi:1,       d:0.65, off:1, p8:1,},   // unstressed syllable level
  {k:'fnl',  lo:1,      hi:1.6,     d:1.25, off:1, p8:1,},   // final lengthening
  {k:'poly', lo:0,      hi:0.3,     d:0.12, off:0, p8:1,},   // shortening per extra syllable
  {k:'stopVc',lo:1,     hi:2,       d:1.5, off:1, p8:1,},    // voiceless/voiced closure ratio
  {k:'apw',  lo:0.15,   hi:0.7,     d:0.34},   // approximant weight against a reference vowel
  {k:'acc',  lo:0,      hi:8,       d:3, off:0, p8:1,},      // accent excursion on a stressed syllable, semitones
  {k:'pert', lo:0,      hi:2,       d:1, off:0, p8:1,},      // consonant perturbation of the following vowel
  // A transition may not outlast this fraction of the shorter segment it joins. `glide` is an
  // absolute time and never scaled with what it connects; 8.1 made unstressed segments short
  // and walked straight into it. off:3 is effectively no cap — the behaviour before it existed.
  {k:'gcap', lo:0.2,    hi:3,       d:0.5, off:3, p8:1,},
  // How long phonation takes to come back after a pause. It used to be instant — flow went
  // from 0 to 1 with only a 5.7 ms one-pole to soften it, so every word onset after a pause
  // rose from DIGITAL SILENCE to full amplitude in about nine milliseconds. The ear hears that
  // as a click, and it is what "a pop before the L and D" turned out to be: /l/ and /d/ are
  // simply what those words start with. off:0 restores the instant onset.
  {k:'onset',lo:0,      hi:0.12,    d:0.035, off:0,},
];
const VOICES = {
  // Measured from a real goal cry: the pitch falls the whole way (158 -> 93 Hz) and the
  // vowel does NOT open. I had modelled it as an arc with the jaw dropping; the recording
  // says otherwise, so the recording wins.
  announcer:{ label:'Goal announcer', note:'Pressed and drawn out, pitch falling the whole way. Measured from a real cry.',
    v:{ rd:0.48, press:0.85, jit:1.4, brth:0.20, drawl:0.62, open:0.06, per:0.62,
        sect:44, f0a:196, f0b:188, f0c:118 } },
  john:{ art:{"i": {"jaw": 0.092, "bodyPos": 0.637, "bodyHi": 0.67, "tipPos": 0.88, "tipHi": 0.25, "lip": 0.65}, "ɪ": {"jaw": 0.785, "bodyPos": 0.602, "bodyHi": 0.924, "tipPos": 0.807, "tipHi": 0.131, "lip": 1}, "ɛ": {"jaw": 0.782, "bodyPos": 0.638, "bodyHi": 0.792, "tipPos": 0.904, "tipHi": 0.086, "lip": 0.966}, "æ": {"jaw": 0.825, "bodyPos": 0.823, "bodyHi": 0.381, "tipPos": 0.742, "tipHi": 0.07, "lip": 0.879}, "ɑ": {"jaw": 0.7, "bodyPos": 0.301, "bodyHi": 0.409, "tipPos": 0.817, "tipHi": 0.059, "lip": 0.589}, "ɔ": {"jaw": 0.33, "bodyPos": 0.336, "bodyHi": 0.482, "tipPos": 0.84, "tipHi": 0.019, "lip": 0.438}, "ʊ": {"jaw": 0.94, "bodyPos": 0.514, "bodyHi": 0.039, "tipPos": 0.84, "tipHi": 0.081, "lip": 0.282}, "u": {"jaw": 0.951, "bodyPos": 0.702, "bodyHi": 0.286, "tipPos": 0.84, "tipHi": 0.037, "lip": 0.178}, "ʌ": {"jaw": 0.33, "bodyPos": 0.223, "bodyHi": 0.308, "tipPos": 0.731, "tipHi": 0.294, "lip": 0.346}, "ɝ": {"jaw": 0.749, "bodyPos": 0.529, "bodyHi": 0.721, "tipPos": 0.79, "tipHi": 0.215, "lip": 0.378}, "ə": {"jaw": 0.891, "bodyPos": 0.55, "bodyHi": 0.406, "tipPos": 0.936, "tipHi": 0.198, "lip": 0.414}, "l": {"jaw": 0.428, "bodyPos": 0.52, "bodyHi": 0.43, "tipPos": 0.7, "tipHi": 0.191, "lip": 1}, "r": {"jaw": 0.617, "bodyPos": 0.708, "bodyHi": 0.147, "tipPos": 0.79, "tipHi": 0.435, "lip": 0.405}, "w": {"jaw": 0.718, "bodyPos": 0.85, "bodyHi": 0.584, "tipPos": 0.84, "tipHi": 0.39, "lip": 0.154}, "j": {"jaw": 0, "bodyPos": 0.677, "bodyHi": 0.603, "tipPos": 0.813, "tipHi": 0.2, "lip": 0.65}, "m": {"jaw": 0.349, "bodyPos": 0.15, "bodyHi": 0.441, "tipPos": 0.85, "tipHi": 0.22, "lip": 0.121}, "n": {"jaw": 0.28, "bodyPos": 0.55, "bodyHi": 0.03, "tipPos": 0.81, "tipHi": 0.78, "lip": 0.545}, "ŋ": {"jaw": 0.347, "bodyPos": 0.592, "bodyHi": 0.78, "tipPos": 0.85, "tipHi": 0, "lip": 0.737}, "s": {"jaw": 0.45, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.85, "tipHi": 0.85, "lip": 0.975}, "z": {"jaw": 0.45, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.85, "tipHi": 0.85, "lip": 1}, "ʃ": {"jaw": 0.35, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.8, "tipHi": 0.75, "lip": 0.577}, "ʒ": {"jaw": 0.35, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.8, "tipHi": 0.8, "lip": 0.627}, "f": {"jaw": 0.3, "bodyPos": 0.35, "bodyHi": 0.15, "tipPos": 0.68, "tipHi": 0.1, "lip": 0.088}, "v": {"jaw": 0.15, "bodyPos": 0.35, "bodyHi": 0.15, "tipPos": 0.84, "tipHi": 0, "lip": 0.088}, "θ": {"jaw": 0.18, "bodyPos": 0.5, "bodyHi": 0.2, "tipPos": 0.96, "tipHi": 0.79, "lip": 0.759}, "ð": {"jaw": 0.355, "bodyPos": 0.5, "bodyHi": 0.2, "tipPos": 0.945, "tipHi": 0.79, "lip": 0.984}}, label:'John', note:'Measured: a 15.9 cm tract from F3, modal voice, pitch around 93 Hz.',
    v:{ rd:1.26, press:0.18, jit:1.0, brth:0.19, drawl:0.08, open:0.05, per:0.13,
        sect:40, f0a:88, f0b:99, f0c:78 } },
  johncry:{ art:{"i": {"jaw": 0.092, "bodyPos": 0.637, "bodyHi": 0.67, "tipPos": 0.88, "tipHi": 0.25, "lip": 0.65}, "ɪ": {"jaw": 0.785, "bodyPos": 0.602, "bodyHi": 0.924, "tipPos": 0.807, "tipHi": 0.131, "lip": 1}, "ɛ": {"jaw": 0.782, "bodyPos": 0.638, "bodyHi": 0.792, "tipPos": 0.904, "tipHi": 0.086, "lip": 0.966}, "æ": {"jaw": 0.825, "bodyPos": 0.823, "bodyHi": 0.381, "tipPos": 0.742, "tipHi": 0.07, "lip": 0.879}, "ɑ": {"jaw": 0.7, "bodyPos": 0.301, "bodyHi": 0.409, "tipPos": 0.817, "tipHi": 0.059, "lip": 0.589}, "ɔ": {"jaw": 0.33, "bodyPos": 0.336, "bodyHi": 0.482, "tipPos": 0.84, "tipHi": 0.019, "lip": 0.438}, "ʊ": {"jaw": 0.94, "bodyPos": 0.514, "bodyHi": 0.039, "tipPos": 0.84, "tipHi": 0.081, "lip": 0.282}, "u": {"jaw": 0.951, "bodyPos": 0.702, "bodyHi": 0.286, "tipPos": 0.84, "tipHi": 0.037, "lip": 0.178}, "ʌ": {"jaw": 0.33, "bodyPos": 0.223, "bodyHi": 0.308, "tipPos": 0.731, "tipHi": 0.294, "lip": 0.346}, "ɝ": {"jaw": 0.749, "bodyPos": 0.529, "bodyHi": 0.721, "tipPos": 0.79, "tipHi": 0.215, "lip": 0.378}, "ə": {"jaw": 0.891, "bodyPos": 0.55, "bodyHi": 0.406, "tipPos": 0.936, "tipHi": 0.198, "lip": 0.414}, "l": {"jaw": 0.428, "bodyPos": 0.52, "bodyHi": 0.43, "tipPos": 0.7, "tipHi": 0.191, "lip": 1}, "r": {"jaw": 0.617, "bodyPos": 0.708, "bodyHi": 0.147, "tipPos": 0.79, "tipHi": 0.435, "lip": 0.405}, "w": {"jaw": 0.718, "bodyPos": 0.85, "bodyHi": 0.584, "tipPos": 0.84, "tipHi": 0.39, "lip": 0.154}, "j": {"jaw": 0, "bodyPos": 0.677, "bodyHi": 0.603, "tipPos": 0.813, "tipHi": 0.2, "lip": 0.65}, "m": {"jaw": 0.349, "bodyPos": 0.15, "bodyHi": 0.441, "tipPos": 0.85, "tipHi": 0.22, "lip": 0.121}, "n": {"jaw": 0.28, "bodyPos": 0.55, "bodyHi": 0.03, "tipPos": 0.81, "tipHi": 0.78, "lip": 0.545}, "ŋ": {"jaw": 0.347, "bodyPos": 0.592, "bodyHi": 0.78, "tipPos": 0.85, "tipHi": 0, "lip": 0.737}, "s": {"jaw": 0.45, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.85, "tipHi": 0.85, "lip": 0.975}, "z": {"jaw": 0.45, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.85, "tipHi": 0.85, "lip": 1}, "ʃ": {"jaw": 0.35, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.8, "tipHi": 0.75, "lip": 0.577}, "ʒ": {"jaw": 0.35, "bodyPos": 0.55, "bodyHi": 0.28, "tipPos": 0.8, "tipHi": 0.8, "lip": 0.627}, "f": {"jaw": 0.3, "bodyPos": 0.35, "bodyHi": 0.15, "tipPos": 0.68, "tipHi": 0.1, "lip": 0.088}, "v": {"jaw": 0.15, "bodyPos": 0.35, "bodyHi": 0.15, "tipPos": 0.84, "tipHi": 0, "lip": 0.088}, "θ": {"jaw": 0.18, "bodyPos": 0.5, "bodyHi": 0.2, "tipPos": 0.96, "tipHi": 0.79, "lip": 0.759}, "ð": {"jaw": 0.355, "bodyPos": 0.5, "bodyHi": 0.2, "tipPos": 0.945, "tipHi": 0.79, "lip": 0.984}}, label:'John shouting', note:'His own goal cry, measured: pitch falling 158 to 93 Hz over 2.9 seconds.',
    v:{ rd:0.55, press:0.80, jit:1.3, brth:0.22, drawl:0.60, open:0.06, per:0.62,
        sect:40, f0a:158, f0b:150, f0c:95 } },
  man:{ label:'Man', note:'A 17.5 cm tract, modal voice, ordinary timing.',
    v:{ rd:0.95, press:0.18, jit:1.0, brth:0.18, drawl:0.08, open:0.05, per:0.17,
        sect:46, f0a:96, f0b:112, f0c:84 } },
  woman:{ label:'Woman', note:'A shorter tract lifts every formant — that, not pitch alone, is the difference.',
    v:{ rd:1.25, press:0.15, jit:1.0, brth:0.21, drawl:0.08, open:0.05, per:0.17,
        sect:37, f0a:200, f0b:232, f0c:178 } },
  child:{ label:'Child', note:'Shorter still, and breathier.',
    v:{ rd:1.35, press:0.12, jit:1.3, brth:0.22, drawl:0.08, open:0.05, per:0.16,
        sect:31, f0a:268, f0b:310, f0c:244 } },
  helium:{ label:'Helium', note:'Same voice, same pitch — sound just travels faster, so the tube rings much higher. Source-filter separation, audible.',
    v:{ rd:0.95, press:0.18, jit:1.0, brth:0.18, drawl:0.08, open:0.05, per:0.17,
        sect:19, f0a:96, f0b:112, f0c:84 } },
  whisper:{ label:'Whisper', note:'Barely phonating: the folds hardly close at all.',
    v:{ rd:2.35, press:0.0, jit:1.8, brth:0.26, drawl:0.10, open:0.03, per:0.20,
        sect:44, f0a:130, f0b:148, f0c:120 } },
  barry:{ label:'Barry White', note:'A long tract and a low larynx: deep, resonant, unhurried.',
    v:{ rd:0.78, press:0.22, jit:1.1, brth:0.18, drawl:0.14, open:0.10, per:0.20,
        damp:0.99972, sect:48, f0a:58, f0b:88, f0c:48 } },
  custom:{ label:'Custom', note:'Yours. Tune it in the Lab, then copy the seed — a seed is the whole voice, tract length and timing included.', v:null },
};
const defaultVoice = () => Object.fromEntries(VOICE_SPEC.map(p => [p.k, p.d]));

// ---- operations on a voice ----
// These lived in index.html, and the seed codec had a second copy in the gate. Both are pure
// functions over VOICE_SPEC and belong beside it. The precedent is not hypothetical: the
// harness once kept its own buildWord, and the F0 contour was in four places.
const SPEC_BY_KEY = Object.fromEntries(VOICE_SPEC.map(p => [p.k, p]));

function clampVoice(v){
  const o = {};
  for(const p of VOICE_SPEC) o[p.k] = Math.max(p.lo, Math.min(p.hi, v[p.k]));
  return o;
}

// WHICH parameters are allowed to move. It used to be all of them, which was already a lot at
// eighteen and is twenty-eight now. Asking an ear "was that better" after changing
// twenty-eight things at once gets you almost no information per comparison — the answer
// cannot be attributed to anything. Mutating a NAMED SUBSET is what makes a round mean
// something. `keys` absent still moves everything, so the old behaviour is one argument away.
function mutateVoice(v, amount, keys){
  const o = { ...v };
  const which = keys && keys.length ? keys.filter(k => SPEC_BY_KEY[k]) : VOICE_SPEC.map(p => p.k);
  for(const k of which){
    const p = SPEC_BY_KEY[k];
    o[k] = v[k] + (Math.random()*2 - 1) * (p.hi - p.lo) * 0.28 * amount;
  }
  return clampVoice(o);
}

// Groups an ear can actually hold in its head at once. `stress` is deliberately the three cues
// of stress together — duration, level and pitch accent — because those are the ones that
// confound each other, and tuning any one of them alone means over-dialling it to cover for
// the other two.
const VOICE_GROUPS = {
  source: ['rd','press','jit','brth','folds','damp','lipR'],
  pitch:  ['f0a','f0b','f0c','pert'],
  stress: ['wkdur','wklev','acc'],
  rhythm: ['per','drawl','glide','stopT','vlen','coda','fnl','poly','stopVc','apw','gcap','onset'],
  tract:  ['sect','open','burst','hiss'],
};

// seed = each parameter as two base-36 digits of its position in range
function encodeVoice(v){
  return VOICE_SPEC.map(p => {
    // clamp: a value outside its range would encode negative or overlong and corrupt the seed
    const t = Math.max(0, Math.min(1295, Math.round((v[p.k]-p.lo)/(p.hi-p.lo)*1295)));
    return t.toString(36).padStart(2,'0');
  }).join('');
}
function decodeVoice(str){
  // Seeds are read positionally, so a seed saved before a parameter existed still loads —
  // the newer parameters simply take their defaults. A voice you liked is never stranded.
  if(typeof str !== 'string') return null;
  str = str.trim().toLowerCase();
  if(!/^[0-9a-z]+$/.test(str) || str.length < 8 || str.length % 2) return null;
  const have = Math.min(VOICE_SPEC.length, str.length/2);
  const v = defaultVoice();
  for(let i = 0; i < have; i++){
    const p = VOICE_SPEC[i];
    const t = parseInt(str.substr(i*2, 2), 36);
    if(!Number.isFinite(t)) return null;
    v[p.k] = p.lo + (t/1295)*(p.hi - p.lo);
  }
  return clampVoice(v);
}

// ---- posture lookup ----
// A voice may carry its own measured postures and falls back to the shared ones for anything
// it does not override. Pass art = null for the shared inventory.
function baseFor(sym, art){
  if(art && art[sym]) return art[sym];
  if(DIPH[sym]){
    const first = DIPH[sym][0];
    if(art && art[first]) return art[first];
    return ART[first];
  }
  return ART[sym] || ART['ə'];
}
function shapeFor(sym, n, art){ return articulate(baseFor(sym, art), n); }

// Hold a shout and your jaw drops — the vowel opens as it goes.
// NOTE, preserved deliberately: this reads ART directly rather than going through baseFor, so
// it ignores per-voice postures where the rest of buildWord honours them. That asymmetry is
// pre-existing. It is recorded here rather than silently corrected, because changing it would
// move the output of every voice that carries its own art, and that is a measurement, not a
// refactor. Fix it on purpose, with the gate watching, not as a side effect of moving files.
function openedShape(sym, amt, n, art){
  const A={...(ART[sym]||ART['ə'])};
  A.jaw   = Math.min(1, A.jaw + amt*(1-A.jaw));
  A.bodyHi= Math.max(0, A.bodyHi*(1-amt*0.55));
  A.lip   = Math.min(1, A.lip + amt*0.35*(1-A.lip));
  return articulate(A, n);
}

// ─── PHASE 8.1: HOW LONG EACH SOUND IS HELD ──────────────────────────────────
// Every held segment used to get weight 1, so "bad" and "bat" divided the word identically
// and every syllable of "banana" got a third of it. Five effects, all measured, none of them
// DSP.
//
// IMPORTANT — what this does NOT do. The weights are normalised against their own sum and
// spent out of `pool`, so they redistribute the word's duration WITHOUT changing it. `D` is
// still the caller's absolute word length, which means an isolated monosyllable cannot get
// longer: "bad" alone has one held segment, and one weight over itself is 1 whatever the
// weight is. The lengthening is real and measurable the moment there is something to be long
// RELATIVE TO — inside a polysyllable, or across a phrase ("bad bat"), which is where the
// comparison lives in connected speech anyway.
//
// Making an isolated word's absolute length follow from its segments means turning `D` from a
// duration into a RATE. That is a much wider change — the F0 contour is built from `end`, the
// duration slider changes meaning, and every gate band that measures a word moves — so it is
// its own step. Filed as 8.1b.

// Peterson & Lehiste (1960), JASA 32(6):693-703, measured English vowel and diphthong
// durations. Normalised so that a lax vowel is about 1. Tense vowels and diphthongs run
// notably longer than lax ones, and schwa is shorter than anything.
const VDUR = {
  i:1.20, 'ɪ':0.90, 'ɛ':0.95, 'æ':1.15, 'ɑ':1.25, 'ɔ':1.40,
  'ʊ':0.95, u:1.20, 'ʌ':0.95, 'ɝ':1.30, 'ə':0.65, o:1.30,
  'aɪ':1.40, 'aʊ':1.50, 'ɔɪ':1.55, 'eɪ':1.30, 'oʊ':1.30,
};
// House & Fairbanks (1953); Peterson & Lehiste (1960). A vowel before a VOICED consonant runs
// about half again as long as the same vowel before a voiceless one — the difference between
// "bad" and "bat", and the largest allophonic duration cue English has. Sonorants sit between,
// and a vowel with nothing closing the syllable is long.
const CODA_VOICED = 1.50, CODA_SONORANT = 1.30, CODA_OPEN = 1.40, CODA_VOICELESS = 1.00;
const UNSTRESSED  = 0.60;    // an unstressed syllable runs a bit over half a stressed one
const FINAL_LENGTH= 1.25;    // the last syllable before a boundary stretches
const POLY_SHORT  = 0.12;    // each extra syllable shortens the ones around it

const VOICED_OBS    = {b:1,d:1,g:1,v:1,'ð':1,z:1,'ʒ':1};
const VOICELESS_OBS = {p:1,t:1,k:1,f:1,'θ':1,s:1,'ʃ':1,h:1};

// What closes this vowel's syllable. Conditioned on the NEXT SEGMENT rather than on syllable
// affiliation, which is exact for a monosyllable — the canonical bad/bat case — and slightly
// over-applies across a syllable boundary, where the consonant is really the next syllable's
// onset. Making it syllable-aware means passing the syllabification down from the speller and
// it is not obviously worth the coupling; noted rather than done.
// `scale` is the `coda` knob: 1 gives the published factors, 0 flattens them to no effect.
function codaFactor(chain, i, scale){
  let f;
  if(i+1 >= chain.length || chain[i+1] === ' ') f = CODA_OPEN;      // word or phrase final
  else {
    const nx = chain[i+1];
    f = VDUR[nx] !== undefined ? CODA_OPEN                          // a vowel: open syllable
      : VOICED_OBS[nx]         ? CODA_VOICED
      : VOICELESS_OBS[nx]      ? CODA_VOICELESS
      :                          CODA_SONORANT;
  }
  return scale === undefined || scale === 1 ? f : 1 + (f-1)*scale;
}

// A word's syllables shorten as it gets longer. Within a single word this cancels — it scales
// every weight by the same number and they are normalised — so it only does anything across a
// phrase, which is exactly where it belongs: it stops a long word from eating a short one's time.
function polyShorten(chain, amt){
  const k = amt === undefined ? POLY_SHORT : amt;
  const f = new Array(chain.length).fill(1);
  let a = 0;
  for(let b = 0; b <= chain.length; b++){
    if(b === chain.length || chain[b] === ' '){
      let nv = 0;
      for(let i = a; i < b; i++) if(VDUR[chain[i]] !== undefined) nv++;
      const s = 1/(1 + k*Math.max(0, nv-1));
      for(let i = a; i < b; i++) f[i] = s;
      a = b + 1;
    }
  }
  return f;
}

// The approximants keep their flat weight, but that weight was calibrated when a vowel
// weighed 1 and a vowel now weighs about 1.5. Left at a bare 0.34 the /l/ of "goal" lost a
// third of its length purely as an accounting side effect — 204 ms to 134 ms — which is not a
// duration decision, it is a units mistake. Hold the ratio instead: a reference vowel is a lax
// one closed by a sonorant, which is what the 0.34 was measured against.
const APPROX_REF = 1.15 * CODA_SONORANT;      // ≈ 1.495
const APPROX_W   = 0.34 * APPROX_REF;

// ─── PHASE 8.2: HOW LONG A STOP STAYS SEALED ─────────────────────────────────
// One `stopHold` served all six. But a voiced closure cannot be held — oral pressure rises to
// meet subglottal pressure and the folds stop — so it is SHORT, while a voiceless one has no
// such limit and runs half again as long. Measured English closures are roughly 50-70 ms for
// /b d g/ against 80-100 for /p t k/, and the difference is a voicing cue in its own right,
// independent of the VOT that follows the release.
//
// Expressed as a multiple of `stopHold` rather than absolute milliseconds, so it still tracks
// the voice's own timing: at the default 75 ms this is 60 against 90.
//
// Place of articulation also moves closure duration a little — labials longest, velars
// shortest — but the effect is smaller and the literature less consistent than for voicing,
// and there is nothing in the bench that would currently catch it going the wrong way. Not
// done rather than done badly.
// ─── PHASE 8.3: HOW LOUD EACH SEGMENT IS ─────────────────────────────────────
// The roadmap listed two things here. One of them turned out to be already done.
//
// "Open vowels are 4-6 dB louder than close ones" is TRUE OF THIS ENGINE ALREADY, and not
// because anything says so — it falls out of the tube. A wide mouth radiates more efficiently
// than a rounded one, the lip section carries that, and the measured span is 5.6 dB with /ɑ/
// loudest and /u/ quietest, which is the real ordering. Adding a per-vowel gain table would
// have double-counted geometry the model already has, in a project whose whole claim is that
// it has no such tables. Measured before writing any: ɑ 0.0, ɪ -0.7, ɛ -1.0, æ -1.5, ʌ -2.1,
// o -2.9, ɔ -3.6, ɝ -3.7, i -4.0, ʊ -4.1, u -5.6 dB. Pinned as a report measurement.
//
// What is NOT emergent is stress, because nothing in the amplitude path has ever been told
// which syllable carries it. Measured on "banana": three syllables within 0.9 dB of each
// other. Real speech puts an unstressed syllable 3-6 dB down as well as making it shorter,
// and 8.1 only did the shorter half.
const UNSTRESSED_LEVEL = 0.65;      // about -3.7 dB, mid-range of the published 3-6

const STOP_CLOSE = { b:0.80, d:0.80, g:0.80, p:1.20, t:1.20, k:1.20 };
// `ratio` is the `stopVc` knob: voiceless over voiced. Split around a mean of 1 so that
// changing the ratio moves the split without moving how much time stops take altogether —
// otherwise this knob would silently be a speaking-rate knob as well. 1.5 gives 0.80 / 1.20.
function closureFor(sym, stopHold, ratio){
  if(STOP_CLOSE[sym] === undefined) return stopHold;
  if(ratio === undefined || ratio === 1.5) return stopHold * STOP_CLOSE[sym];
  const vd = 2/(1+ratio), vl = 2*ratio/(1+ratio);
  return stopHold * (STOP_CLOSE[sym] < 1 ? vd : vl);
}

// ---- a word, as keyframes ----
function buildWord(chain, opts){
  // Everything this used to reach out of scope for is now an argument. It closed over N (the
  // section count) and voiceName (through baseFor/shapeFor/openedShape), which is why it could
  // not be shared: the harness had to keep a near-copy, and that copy drifted by construction.
  const o = opts || {};
  const n = o.n || 44;
  const vart = o.art || null;                     // per-voice posture overrides, or null
  const D = o.D;
  const drawl = o.drawl || 0;
  let glide = o.glide, stopHold = o.stopHold, open = o.open;
  glide = glide||0.085; stopHold = stopHold||0.075; open = open||0;
  // The prosody knobs arrive as one object rather than eight arguments, so that 8.4's can join
  // without touching a call site again. A voice IS that object — every key is in VOICE_SPEC —
  // so callers pass the voice straight in. Absent, every one of them takes its published value
  // and the output is bit-identical to before they existed, which the gate asserts.
  const pr = o.pros || {};
  const P_ = (k, dflt) => (pr[k] === undefined ? dflt : pr[k]);
  const vlen = P_('vlen', 1), codaK = P_('coda', 1), polyK = P_('poly', POLY_SHORT);
  const wkdur = P_('wkdur', UNSTRESSED), wklev = P_('wklev', UNSTRESSED_LEVEL);
  const fnl = P_('fnl', FINAL_LENGTH), stopVc = P_('stopVc', 1.5);
  const apw = P_('apw', 0.34) * APPROX_REF;
  const gcap = P_('gcap', 0.5);
  const base  = sym => baseFor(sym, vart);
  const shape = sym => articulate(base(sym), n);
  const isStop=c=>STOP_KEYS.includes(c), isAp=c=>APPROX.includes(c);
  // The stops no longer cost the same, so the time they take out of the word has to be summed
  // rather than counted. Total word length is still exactly D — pool absorbs the difference —
  // which is the same invariant 8.1 holds and the reason no other gate band moves.
  const stopTime=chain.filter(isStop).reduce((a,c)=>a+closureFor(c,stopHold,stopVc),0);
  // transitions into a consonant are fast; a slow approach to /l/ just sounds like /w/
  const rawGlide=(i)=> (i>0 && isPause(chain[i-1])) ? 0
                     : (i>0 && (isStop(chain[i])||isAp(chain[i]))) ? glide*0.45 : glide;
  // A glide may not outlast what it joins. This needs the durations, and the durations need the
  // total glide time, so it is done in two passes: size everything with the uncapped glide,
  // then cap against those durations and size again. One iteration is enough — the second pass
  // only ever RETURNS time to the pool, so durations grow and the caps would only loosen.
  let glideOf=(i)=>rawGlide(i);
  const glideFor=(i)=>glideOf(i);
  const vw=[];                            // weights over everything that is held
  let first=true;
  // Phase 8.1. Where every weight used to be 1, five measured effects now set it. The
  // approximants are deliberately left at their flat 0.34: /l/ carries the goal cry and its
  // formants are gated, so moving its duration is a change to make on purpose with the bench
  // watching, not a side effect of a timing step. Filed with 8.7, where dark /l/ lives.
  const stress = o.stress || null;         // parallel to chain, or null for "all stressed"
  const poly   = polyShorten(chain, polyK);
  let lastHeld = -1;
  chain.forEach((c,i)=>{ if(!isStop(c)&&!isPause(c)) lastHeld=i; });
  chain.forEach((c,i)=>{ if(isStop(c)||isPause(c)) return;
    if(isAp(c)){ vw.push(apw); return; }        // a lateral is a beat, not a vowel
    const vd = VDUR[c]===undefined ? 1 : VDUR[c];
    let w = (vlen===1 ? vd : 1+(vd-1)*vlen)        // intrinsic length
          * codaFactor(chain,i,codaK)              // what closes the syllable
          * poly[i];                               // how long the word is
    if(stress && stress[i]===0) w *= wkdur;
    if(i===lastHeld)            w *= fnl;
    if(first){ w *= 1+drawl*2.6; first=false; }    // the drawl, unchanged
    vw.push(w);
  });
  const wsum=vw.reduce((a,b)=>a+b,0)||1;
  const held=chain.filter(c=>!isStop(c)&&!isPause(c)).length;
  const sizeUp=()=>{
    let g=0; for(let i=1;i<chain.length;i++) g+=glideFor(i);
    const p=Math.max(0.12*Math.max(held,1), D-stopTime-g);
    const out=[]; let k2=0;
    chain.forEach((sym,i)=>{ out[i]= isPause(sym) ? 0
      : isStop(sym) ? closureFor(sym,stopHold,stopVc) : p*vw[k2++]/wsum; });
    return {pool:p, durs:out};
  };
  let sized=sizeUp();
  if(gcap < 3){
    const d0=sized.durs;
    glideOf=(i)=>{
      const raw=rawGlide(i);
      if(i<1) return raw;
      const near=Math.min(d0[i-1]||raw, d0[i]||raw);
      return Math.min(raw, near*gcap);
    };
    sized=sizeUp();
  }
  let pool=sized.pool;
  const keys=[], art=[], seg=[]; let t=0, k=0;
  chain.forEach((sym,i)=>{
    if(isPause(sym)){
      // Hold the previous shape briefly, then GLIDE to the next sound while silent. The
      // articulators travel during the gap, which is what makes two words sound like a
      // phrase rather than two recordings played back to back.
      const nextSym=chain[i+1];
      const gap=Math.max(0.09, Math.min(0.30, 0.14*(1+drawl)));
      const prev=chain[i-1];
      const pd=prev?Array.from(shape(prev)):Array.from(shape('ə'));
      const nd=nextSym?Array.from(shape(nextSym)):pd;
      const pA=prev?base(prev):base('ə');
      const nA=nextSym?base(nextSym):pA;
      keys.push({t,d:pd,b:0,nz:0,vl:1,fr:0,as:0,sil:1,lv:1}); art.push({t,A:pA});
      seg.push({sym:' ', a:t, b:t+gap});
      t+=gap;
      keys.push({t,d:nd,b:0,nz:0,vl:1,fr:0,as:0,sil:1,lv:1}); art.push({t,A:nA});
      return;
    }
    const d=Array.from(shape(sym));
    const A=base(sym);
    const b=branchFor(sym), nz=nasalFor(sym), vl=voicelessFor(sym),
          fr=fricFor(sym), as=aspFor(sym);
    const lv=(stress && stress[i]===0) ? wklev : 1;
    const dur=isStop(sym) ? closureFor(sym,stopHold,stopVc) : pool*vw[k++]/wsum;
    if(i>0) t+=glideFor(i);
    seg.push({sym, a:t, b:t+dur});
    keys.push({t,d,b,nz,vl,fr,as,lv}); art.push({t,A});
    t+=dur;
    // A diphthong always glides to its second target, however short. A plain vowel only
    // drifts open when held long enough for the jaw to move.
    if(isDiph(sym)){
      const A2=base(DIPH[sym][1]);
      keys.push({t,d:Array.from(articulate(A2,n)),b,nz,vl,fr,as,lv}); art.push({t,A:A2});
      t+=0; // the segment already advanced
    } else {
    const canOpen = !isStop(sym) && !isAp(sym) && open>0.01 && dur>0.28;
    if(canOpen){
      const amt=open*Math.min(1,(dur-0.28)/0.9);
      const A2={...A, jaw:Math.min(1,A.jaw+amt*(1-A.jaw)),
                      bodyHi:Math.max(0,A.bodyHi*(1-amt*0.55)),
                      lip:Math.min(1,A.lip+amt*0.35*(1-A.lip))};
      keys.push({t,d:Array.from(openedShape(sym,amt,n,vart)),b,nz,vl,fr,as,lv}); art.push({t,A:A2});
    } else {
      keys.push({t,d,b,nz,vl,fr,as,lv}); art.push({t,A});
    }
    }
  });
  return {keys, art, seg, end:t+0.22};
}

// ─── PHASE 8.4: THE PITCH CONTOUR ────────────────────────────────────────────
// This lived in FOUR places — index.html twice, the harness and the bench — as the same six
// lines copied out. That is the shape of mistake this project has already paid for once, when
// the harness kept its own near-copy of buildWord and the comment beside it admitted that a
// gate with its own slightly different copy is exactly how you end up testing the wrong thing.
// One copy, before changing anything about it.
//
// SEMITONES, NOT HERTZ. The contour was interpolated linearly in Hz, and pitch is not heard
// that way: a fall from 200 to 100 spends half its time above 150, but the ear puts the
// midpoint at 141. Every fall in every voice has therefore been the wrong SHAPE — too slow at
// the top, too fast at the bottom — while hitting all the right endpoints, which is why it
// never showed up as a wrong note. Interpolating in log frequency and converting back is the
// whole fix.
const lerpHz = (a, b, u) => a * Math.pow(b/a, u);      // linear in semitones

function buildF0(end, v, opts){
  const o = opts || {};
  const stress = o.stress || null;   // parallel to chain
  const seg    = o.seg || null;      // buildWord emits exactly one seg per chain symbol, in order
  const a = v.f0a, b = v.f0b, c = v.f0c;
  // The shape that was already here: rise to a peak, hold, fall away. It is a good goal cry —
  // it was measured from one — and it is kept as the BASELINE the whole utterance sits on.
  // What it never was is a sentence, because its peak lands at a fixed fraction of the word
  // regardless of which syllable is stressed.
  const pts = [[0,a],[Math.min(0.12,end*0.1),b],[end*0.55,b],
               [end*0.82,(b+c)/2],[end,c],[end+0.2,c*0.92]];
  const at = t => {
    if(t <= pts[0][0]) return pts[0][1];
    for(let k=1;k<pts.length;k++) if(t <= pts[k][0]){
      const [t0,v0]=pts[k-1],[t1,v1]=pts[k];
      return t1===t0 ? v1 : lerpHz(v0, v1, (t-t0)/(t1-t0));
    }
    return pts[pts.length-1][1];
  };
  const semis = (v.acc  === undefined ? 3   : v.acc);
  const pert  = (v.pert === undefined ? 1   : v.pert);
  if(!stress || !seg) return pts;

  // ---- everything above the baseline is an OFFSET IN SEMITONES ----
  // Written as summed contributions rather than as points pushed onto the contour, because two
  // of them land on the same vowel and would otherwise fight over the same instant: a stressed
  // syllable after a /t/ has BOTH a raised onset and an accent peak, and it really does have
  // both. Semitones add where hertz would not, which is the other reason this is the right
  // space to work in.
  const parts = [];                            // each: {t0, t1, f(t) -> semitones}
  const ramp = (t0, t1, v0, v1) => ({ t0, t1,
    f: t => t<=t0 ? v0 : t>=t1 ? v1 : v0 + (v1-v0)*(t-t0)/(t1-t0) });

  const isNuc = sym => VDUR[sym] !== undefined || DIPH[sym] !== undefined;
  const nuclei = [];
  seg.forEach((sg, i) => { if(sg.sym !== ' ' && isNuc(sg.sym)) nuclei.push([sg, i]); });

  // ACCENTS, on the stressed nuclei only. `stress` marks every phone of a stressed syllable,
  // so accenting all of them puts three excursions on one syllable and reads as a wobble.
  if(semis > 0.01) for(const [sg, i] of nuclei){
    if(!stress[i]) continue;
    const mid = (sg.a + sg.b)/2;
    parts.push(ramp(sg.a, mid, 0, semis));
    parts.push(ramp(mid, sg.b, semis, 0));
  }

  // CONSONANT PERTURBATION. A vowel does not start at its own pitch: after a voiceless
  // obstruent it starts HIGH and falls into place, after a voiced one it starts LOW and rises.
  // Hombert, Ohala & Ewan (1979); House & Fairbanks (1953). The effect is asymmetric — the
  // voiceless raising is roughly twice the voiced lowering — and it is gone within about 60 ms,
  // which is why it is microprosody and not intonation. Small, and its absence is one of the
  // things that makes synthetic speech sound assembled rather than spoken.
  if(pert > 0.01) for(const [sg, i] of nuclei){
    const prev = i > 0 ? seg[i-1].sym : null;
    if(!prev) continue;
    const st = VOICELESS_OBS[prev] ? 1.2*pert : VOICED_OBS[prev] ? -0.7*pert : 0;
    if(!st) continue;
    const back = Math.min(0.06, (sg.b - sg.a) * 0.6);   // never longer than the vowel it marks
    parts.push(ramp(sg.a, sg.a + back, st, 0));
  }

  if(!parts.length) return pts;
  // Sample where anything changes, and nowhere else.
  const times = new Set(pts.map(p => p[0]));
  for(const p of parts){ times.add(p.t0); times.add(p.t1); times.add((p.t0+p.t1)/2); }
  const out = [...times].filter(t => t >= 0 && t <= end + 0.2).sort((x,y) => x-y);
  return out.map(t => {
    let d = 0;
    // HALF-OPEN, [t0, t1). Strict-on-both-sides missed the value AT a ramp's start, which is
    // exactly where consonant perturbation lives — it fired on nothing. Closed-on-both-sides
    // would double-count at an accent's peak, where one ramp ends and the next begins.
    for(const p of parts) if(t >= p.t0 && t < p.t1) d += p.f(t);
    return [t, at(t) * Math.pow(2, d/12)];
  });
}

const HOLLER = {
  ART, STOPS, VELAR, DIPH, APPROX, STOP_KEYS, VOWEL_KEYS, CONS_KEYS,
  BRANCHED, NASAL, VOICELESS, FRICATIVE, ASPIRATE,
  VOICE_SPEC, VOICES, defaultVoice, VOICE_GROUPS,
  clampVoice, mutateVoice, encodeVoice, decodeVoice,
  restingDiam, hump, articulate, baseFor, shapeFor, openedShape, buildWord,
  VDUR, CODA_VOICED, CODA_SONORANT, CODA_OPEN, CODA_VOICELESS,
  UNSTRESSED, FINAL_LENGTH, POLY_SHORT, APPROX_W, codaFactor, polyShorten,
  STOP_CLOSE, closureFor, UNSTRESSED_LEVEL, buildF0, lerpHz,
  branchFor, nasalFor, voicelessFor, fricFor, aspFor, isPause, isDiph
};

root.HOLLER = HOLLER;
if (typeof module !== 'undefined' && module.exports) module.exports = HOLLER;

})(typeof window !== 'undefined' ? window : globalThis);
