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
  "jaw": 0.06,
  "bodyPos": 0.343,
  "bodyHi": 0.373,
  "tipPos": 0.796,
  "tipHi": 0.238,
  "lip": 0.01
 },
 "n": {
  "jaw": 0.014,
  "bodyPos": 0.737,
  "bodyHi": 0.5,
  "tipPos": 0.903,
  "tipHi": 0.856,
  "lip": 0.862
 },
 "ŋ": {
  "jaw": 0.48,
  "bodyPos": 0.635,
  "bodyHi": 0.94,
  "tipPos": 0.642,
  "tipHi": 0.184,
  "lip": 0.521
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
  "tipHi": 0.88,
  "lip": 0.931
 },
 "z": {
  "jaw": 0.35,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.85,
  "tipHi": 0.85,
  "lip": 0.931
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
  "lip": 0.052
 },
 "w": {
  "jaw": 0.854,
  "bodyPos": 0.626,
  "bodyHi": 0.946,
  "tipPos": 0.631,
  "tipHi": 0.15,
  "lip": 0.144
 },
 "j": {
  "jaw": 0.241,
  "bodyPos": 0.676,
  "bodyHi": 0.786,
  "tipPos": 0.788,
  "tipHi": 0.039,
  "lip": 0.692
 },
 "r": {
  "jaw": 0.691,
  "bodyPos": 0.622,
  "bodyHi": 0.37,
  "tipPos": 0.717,
  "tipHi": 0.724,
  "lip": 0.293
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
  "lip": 0.052
 },
 "ʒ": {
  "jaw": 0.45,
  "bodyPos": 0.55,
  "bodyHi": 0.28,
  "tipPos": 0.842,
  "tipHi": 0.86,
  "lip": 0.452
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
  "lip": 0.86
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
// HOW LOUD EACH FRICATIVE IS, and these were all far too loud. Measured against a person
// reading the bench phrases: every class of sound in the model sat within 2.3 dB of every other
// — vowels at -36.3, approximants -36.8, fricatives -38.6 — where a real fricative is 10 to 30
// dB below a vowel. Nothing stood out, and that flatness is most of what "robotic" means.
//
// Real levels relative to a stressed vowel (Fant; Stevens): sibilants -10 to -18, the weak
// fricatives -25 to -30, /h/ around -22. The model was at -1.5 to -8.4.
//
// The reason they were pushed up is worth recording: the gate required every fricative to reach
// 22% of a vowel, which is -13 dB, and a real /ð/ is at -30. That floor was wrong in kind as
// well as degree — a weak fricative is not audible because it is LOUD, it is audible because it
// has high-frequency energy where the vowel beside it has none. Measured, that contrast is 126
// to 632 times, so these can drop twenty decibels and still be unmistakable.
const FRICATIVE={ 's':0.235, 'z':0.102, 'ʃ':0.40, 'ʒ':0.22,
                  'f':0.073, 'v':0.050, 'θ':0.013, 'ð':0.010 };
const ASPIRATE ={ h:1 };                               // turbulence at the glottis instead

const branchFor    = sym => BRANCHED[sym]  || 0;
const nasalFor     = sym => NASAL[sym]     || 0;
const voicelessFor = sym => VOICELESS[sym] || 0;
const fricFor      = sym => FRICATIVE[sym] || 0;
const aspFor       = sym => ASPIRATE[sym]  || 0;
// A break is a pause too — everything that skipped word boundaries must skip these, or a
// comma would be handed to articulate() as though it were a posture.
const isBreak = sym => typeof sym === 'string' && sym.slice(0,3) === 'brk';
const isPause = sym => sym === ' ' || isBreak(sym);
// How long each one holds, as a multiple of the ordinary word gap. Measured values vary a lot
// with speaking style; these are the conventional ratios — a comma is about twice a word
// boundary and a full stop about four times.
// Punctuation has to stand clear of the WORD GAPS, and it stopped doing so the moment those
// became variable. A word gap now runs 32 to 135 ms around a median of 49; a comma was 107 and a
// full stop 194, so a comma sat inside the word-gap range and a sentence boundary was barely
// outside it. Reported as "Call me Ishmael" having no pause after the name — and it had one, of
// 194 ms, which is simply not a pause when an ordinary word boundary can be 117.
//
// Sized against the recording instead. The long within-phrase pauses there are 220 to 290 ms and
// those are commas; a sentence boundary is longer again. 5.6 and 11.5 put a comma at about
// 270 ms and a full stop at about 560, which clears the word-gap distribution entirely.
const BREAK_GAP = { 'brk,': 5.6, 'brk;': 8.0, 'brk.': 11.5, 'brk?': 11.5, 'brk…': 19.0 };
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
  // The floors were 80, 90 and 70, and Barry White sits at 58, 88 and 48 — below all three. A
  // preset outside its own bounds cannot survive a seed: encoding clamps it, so a link to Barry
  // arrived as a higher voice, and the page could not recognise the seed as Barry either.
  // Lowered to accommodate the deepest voice the set actually contains, with room under it.
  {k:'f0a',  lo:40,     hi:330,     d:208},     // pitch: onset  (must reach a man at 110
  {k:'f0b',  lo:45,     hi:380,     d:250},     //        peak     and a child at 310)
  {k:'f0c',  lo:35,     hi:300,     d:190},     //        fall
  {k:'drawl',lo:0,      hi:1,       d:0.55, off:0,},    // how much the first vowel is stretched
  {k:'glide',lo:0.03,   hi:0.22,    d:0.085},  // transition time between sounds
  {k:'stopT',lo:0.035,  hi:0.15,    d:0.075},  // how long a stop stays sealed
  {k:'burst',lo:0.02,   hi:1.2,     d:0.16, off:0.02,},   // release strength; the seal does most of the work
  {k:'hiss', lo:0.3,    hi:2.2,     d:1.0},    // how hard fricatives hiss
  {k:'sect', lo:14,     hi:52,      d:44},     // tract length in sections (44 = 17.5 cm)
  {k:'open', lo:0,      hi:1,       d:0.05, off:0,},   // how far a held vowel opens as it is shouted
  // SECONDS PER SOUND. The floor was 0.10 while a calibrated voice sits at 0.095 — so John was
  // below his own declared minimum, and a seed round-trip would have clamped his tempo back up.
  // Real connected speech averages 70 to 80 milliseconds a sound, so the floor was wrong on its
  // own terms as well.
  {k:'per',  lo:0.04,   hi:0.80,    d:0.0496},   // seconds per sound
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
  // HOW FAR A PITCH ACCENT LIFTS A STRESSED SYLLABLE. It was 3 semitones, and measured against
  // a person reading the bench phrases the shortfall is entirely upward: their pitch runs 3.7
  // semitones BELOW its own median and 9.6 ABOVE, and the model ran -4.1 and +2.6. The downward
  // half was already right; the accents never lifted anything.
  //
  // Real conversational accents are 5 to 8 semitones on a stressed syllable and more under
  // focus. The mechanism was never at fault — with acc at 6 a stressed vowel lifts 5.9 — so
  // this is only the number. The ceiling goes to 14 so that a deliberately expressive voice can
  // reach what an expressive reading does.
  {k:'acc',  lo:0,      hi:14,       d:7.0, off:0, p8:1,},      // accent excursion on a stressed syllable, semitones
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
  // How long a word boundary takes, and whether it is silent. Below 0.09 it is a TRANSITION —
  // the articulators travel while phonation continues, which is what connected speech does.
  // At or above 0.09 it becomes a real pause and is silenced, which is the old behaviour and
  // what `off` restores.
  {k:'wgap', lo:0.015,  hi:0.30,    d:0.045, off:0.14, p8:1,},
  // Phase 9. The time constant of a critically damped articulator. 0 tracks the keyframes
  // exactly, which is every version of this engine until now; anything above 0 means the tract
  // has inertia and stops being able to arrive everywhere it is asked to.
  // ---- the gestural score, Phase 9 ----
  // These four are how a consonant is dialled, and they are physical rather than cosmetic.
  // A gesture in articulatory phonology has a target, a stiffness and a blending strength; the
  // target is the posture and these are the rest. They were hardcoded numbers doing real
  // linguistic work, which is exactly the kind of thing this project keeps finding out too late.
  {k:'artT',    lo:0,     hi:0.06,   d:0.025, off:0,},   // how much mass the articulators have
  // How narrow a target has to be before it counts as CRITICAL — something the speaker has to
  // hit rather than aim at. off:0 makes nothing critical, so every gesture is equally lazy.
  // How wide a target still counts as a gesture that has to be HIT. At 0.6 only constrictions
  // qualified, and everything wider took the full slow time constant — so /n/ sealed to within
  // a thousandth while its pharynx sat 0.8 out. Raising it stiffens the resonator too.
  //
  // The vowel formant error it buys is small in absolute terms — 1.6% to 0.6% — because
  // formants are insensitive to the exact width of a wide section. It is worth having anyway,
  // and it is worth recording that the DIAMETER distance overstated this badly: 0.426 of
  // undershoot in the wide parts sounds like a catastrophe and is 1.6% of formant error.
  {k:'artCrit', lo:0,     hi:4.0,    d:2.0,   off:0,},
  // How much stiffer the most critical gesture is, as a fraction of the base time constant.
  // Lower is crisper: 0.22 means a full closure is tracked four and a half times faster than a
  // vowel. off:1 removes the distinction entirely and is what silenced /z/ the first time.
  {k:'artStiff',lo:0.1,   hi:1,      d:0.22,  off:1,},
  // How far past the surface a closure is aimed. A tongue does not stop at the palate, it
  // presses into it and the tissue stops it. off:0 aims exactly at the target, which is what
  // made stops fail to seal above artT=0.02.
  {k:'artPush', lo:0,     hi:1,      d:0.45,  off:0,},
  // Output level. Every voice peaked between -13 and -24 dBFS where a normal recording peaks
  // near -8, so about 24 dB of range went unused and the whole thing was quiet at full volume.
  // Soft-saturated rather than clamped, because the spread between the quietest and loudest
  // voice is 11 dB and a flat gain with a hard clip cannot serve both.
  {k:'outGain', lo:0.5,   hi:12,     d:4.0,   off:1,},
  // How far a section has to travel before it is driven at full stiffness. A muscle pulls
  // harder for a longer movement, and keying stiffness on how NARROW a target is instead meant
  // the widest movements in the model got the slowest articulators. off:0 removes the travel
  // term and restores the narrowness-only rule.
  {k:'artFar',  lo:0,     hi:3,      d:1.4,   off:0,},
  // The velum's own time constant. It was the last thing in the engine that could still
  // teleport — Phase 9 gave every part of the tract mass and left this tracking its keyframes
  // exactly, so it swung fully open in 26 ms. A real one takes about a hundred and is the
  // SLOWEST articulator there is: a flap of soft tissue with no bone in it and nothing to brace
  // against. The lateral pocket is the sides of the tongue parting, so it runs at half this.
  {k:'velT',    lo:0,     hi:0.06,   d:0.020, off:0,},
  // How fully the pitch comes back up at a phrase boundary, and how far a question rises at
  // the end. Both were unreachable until punctuation survived the speller.
  // Calibrated against a person reading the bench phrases. At 1.8 the model fell 6.7 to 10.0
  // semitones across a phrase where the recording falls 2.7 to 7.5, and bottomed out at 54 Hz
  // against a floor of 79. Halving it halves the error.
  {k:'decl',    lo:0,     hi:4,      d:0.60,  off:0,  p8:1,},
  {k:'reset',   lo:0,     hi:1,      d:0.70,  off:0,  p8:1,},
  {k:'ask',     lo:0,     hi:9,      d:5.0,   off:0,  p8:1,},
  // How much of the voicing a full-strength frication costs. A voiced fricative is much
  // quieter than a vowel — the constriction raises the pressure above the folds and the flow
  // across them nearly stops — and `squeeze` alone was not cutting nearly enough, leaving /ð/
  // at 99% voice and /ʒ/ at 83%.
  // 0.88 removed almost all the voicing from a voiced fricative, and voicing is the ENTIRE cue
  // that separates /v/ from /f/. Measured: /v/ came out 5.8 dB QUIETER than /f/ — backwards for
  // a sound that has voicing energy added — with 48% of its energy down where voicing lives
  // against /ʒ/'s 19%. Reported as "the v in heavens is more f than v", which is exactly right.
  //
  // At 0.55 the three voiced fricatives keep 76 to 82% of their energy low, /v/ pulls level with
  // /f/ (-0.1 dB) and /ʒ/ goes 2.1 dB above /ʃ/, which is what a voiced fricative should do.
  //
  // Not lower. At 0.40 they reach 87 to 93%, and that is the failure this knob exists to prevent
  // — the comment in the worklet records /ð/ at 99% being heard as "a loo a", a hum with a trace
  // of noise on it rather than a fricative.
  {k:'fricDuck',lo:0,     hi:0.95,   d:0.55,  off:0,},
];
// John, rebuilt off `man` rather than off the fit.
//
// Two independent estimates of what his tract length should be agree. The length-to-pitch line
// through barry/man/woman/child puts an 88 Hz speaker at 17.9 cm — sect 45. And RECORDING.md
// records the fitter coming back about 8% low, which turns his measured 15.9 into 17.2 — sect
// 43. Splitting them at 44 also lands exactly where the shared posture table is calibrated:
// 10/10 against Peterson & Barney there, against 4/10 at his fitted 40.
//
// Pitch is his, measured, and unaffected by any of this — F0 is not a resonance. `rd` is his
// measured 1.26, from H1-H2, which lives at the first two harmonics and so was not touched by
// the tract error either; RECORDING.md does warn that the H1-H2 to Rd mapping is approximate,
// so if he still sounds too breathy, man's 0.95 is the number to try.
const VOICES = {
  // Measured from a real goal cry: the pitch falls the whole way (158 -> 93 Hz) and the
  // vowel does NOT open. I had modelled it as an arc with the jaw dropping; the recording
  // says otherwise, so the recording wins.
  announcer:{ label:'Goal announcer', note:'Pressed and drawn out, pitch falling the whole way. Measured from a real cry.',
    v:{ rd:0.48, press:0.85, jit:1.4, brth:0.20, drawl:0.62, open:0.06, per:0.62,
        sect:44, f0a:196, f0b:188, f0c:118 } },
  // The fitted one, kept because it is what the recording actually produced and the comparison
  // is worth keeping. It is not the default any more: its postures score 1/10 within 12% of
  // Peterson & Barney at their own tract length where the shared table manages 4/10, and its
  // 15.9 cm tract sits 36% off the length-to-pitch line the other voices lie on — every one of
  // which is within 17%. A 15.9 cm tract with an 88 Hz larynx is a small adult with a large
  // voice box, which is not a person.
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

// Tuned by ear in the wizard and sent as a seed. Pressed rather than modal, with real jitter and
// a shorter tract than the pitch alone would suggest — 15.8 cm against the 17.5 that 96 Hz would
// imply, which is what makes it sound like a particular person rather than a size.
//
// `per` IS NOT FROM THE SEED. The seed carried 0.0952, which was this preset's value until the
// duration law was fitted against a recording the same morning — so it predates the fix and would
// have undone it: 4.93 s for the Hamlet line against the 2.56 s it was actually read in, nearly
// twice too slow. Everything else in the seed is voice quality and is taken as sent.
VOICES.john = {
  label: 'John',
  v: { rd: 1.26, press: 0.70, brth: 0.30, jit: 3, f0a: 96, f0b: 112, f0c: 84,
       drawl: 0.08, sect: 39.76, per: 0.0496, artT: 0.020,
       wklev: 0.45, acc: 6, decl: 1.202 },
  note: 'Tuned by ear: pressed, with jitter and a short tract for its pitch. Timing is calibrated '
      + 'against a recording rather than taken from the seed.'
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
  rhythm: ['per','drawl','glide','stopT','vlen','coda','fnl','poly','stopVc','apw','gcap','onset','wgap'],
  tract:  ['sect','open','burst','hiss','outGain'],
  // The articulators themselves — how a consonant is dialled.
  gesture:['artT','artCrit','artStiff','artPush','velT','fricDuck','decl','reset','ask','artFar'],
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
// which symbols are vowels — needed in more than one place now, and worth stating once rather
// than inferring from "is it in VDUR", which stopped being a vowel test the moment consonants
// were added to that table
const VOWELS = new Set(['i','ɪ','ɛ','æ','ɑ','ɔ','ʊ','u','ʌ','ɝ','ə','o',
                        'aɪ','aʊ','ɔɪ','eɪ','oʊ']);

const VDUR = {
  i:1.20, 'ɪ':0.90, 'ɛ':0.95, 'æ':1.15, 'ɑ':1.25, 'ɔ':1.40,
  'ʊ':0.95, u:1.20, 'ʌ':0.95, 'ɝ':1.30, 'ə':0.65, o:1.30,
  'aɪ':1.40, 'aʊ':1.50, 'ɔɪ':1.55, 'eɪ':1.30, 'oʊ':1.30,

  // CONSONANTS HAVE INTRINSIC LENGTHS TOO, and until now this table had none, so all sixteen
  // fell through to a default of 1 — the length of a mid vowel. A nasal ran as long as the /ɛ/
  // beside it. Every listening pass since has said the same thing in different words: "too
  // slow", "a little slurred", and, of a fricative, "drawn out".
  //
  // Umeda (1977) and Klatt (1976), intervocalic, normal rate, against the same reference this
  // table already used — 1.0 is about 100 ms, which is where /ɛ/ at 0.95 sits.
  //
  // The voiceless/voiced asymmetry is the large one and it runs the same way as it does in
  // vowels: a voiceless fricative is held much longer than its voiced partner. /f/ against /v/
  // is nearly two to one.
  s:1.05, 'ʃ':1.10, f:0.85, 'θ':0.85,          // voiceless fricatives, the longest consonants
  z:0.75, 'ʒ':0.85, v:0.55, 'ð':0.50,          // voiced: much shorter
  h:0.60,
  // NO NASALS HERE, deliberately. /m n ŋ/ never reach this table — isAp() routes them through
  // the flat approximant weight, which puts them at about 110 ms, and that is roughly right.
  // Entries for them were written and measured as dead code: the weight changed and nothing
  // moved.
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
/**
 * The rate a word should be spoken at — 8.1b's tempo control, in ONE place.
 *
 * `per` stays what it always was, seconds per sound, so every existing seed still means what it
 * meant. The 0.90 is calibrated rather than chosen: it is the multiplier that best preserves
 * the current tempo across a seven-phrase corpus once the weights start SETTING length instead
 * of dividing a fixed one.
 *
 * `D` is optional and means "make this word about this long" — the duration slider, the goal
 * cry. It becomes a stretch on the rate rather than a hard total, so a word asked to be twice
 * as long is twice as long throughout instead of having its proportions squeezed to fit.
 */
// ── HOW LONG A PHRASE TAKES ───────────────────────────────────────────────
//
// Not sounds x per. Measured against a person reading these phrases, the time per sound FALLS as
// the phrase gets longer:
//
//   a probe    18 sounds   1.70 s   0.094 s a sound
//   Hamlet     37          2.70     0.073
//   Frost      87          5.20     0.060
//
// Three independent pairings and they disagree by more than fifty per cent, which is why the
// model was nearly right on four-word probes and sixty per cent slow on a passage: a constant
// `per` cannot be both. Longer utterances are spoken faster per sound — a well-attested effect
// and one nobody had thought to look for here, because nothing longer than a probe was ever
// tested until the passages went into the phrase list.
//
// A FIXED COST PLUS A RATE, not a power law. The first version here was
// D = per x n x (40/n)^0.285, fitted on three points paired to texts BY DURATION, because the
// reading order was unknown. Told the order, the pairing changed and so did the shape:
//
//   15 sounds  1.65 s   0.110 s a sound
//   18         1.77     0.098
//   37         2.56     0.069
//   46         2.83     0.061
//   47         2.71     0.058
//   87         5.28     0.061
//
// It FLATTENS above about forty rather than continuing to fall — 87 sounds costs the same per
// sound as 46. A power law cannot do that. It keeps decreasing, and it under-ran the longest
// phrase by 14% while over-running the shortest by the same.
//
// Least squares on all six: 735 ms of fixed cost per utterance plus 49.6 ms a sound. Worst point
// 13%, against 24% for the power law and 60% for the constant `per` before either. It is also
// the more sensible shape — an utterance has a beginning and an end that cost time regardless of
// how much lies between them, and that is what a constant term is.
//
// `per` is the rate now. The fixed part is expressed in units of it, so a slow voice is slow
// throughout rather than slow in the middle and brisk at the edges.
const LEN_FIXED = 14.8;      // 735 ms of fixed cost, in units of the 49.6 ms rate
function phraseTime(n, per){
  return per * (LEN_FIXED + Math.max(1, n));
}

function rateFor(chain, D, v){
  const per = (v && v.per) || 0.17;
  const base = per*0.90;
  if(!D) return base;
  const natural = Math.max(0.45, chain.length*per);
  return base*(D/natural);
}

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
  const wgap = P_('wgap', 0.045);
  // The spread on that gap, seeded from the chain itself. Same words, same rhythm — so a phrase
  // sounds the same twice running and two voices can be compared on it — while different phrases
  // get different patterns, which is the whole point. A counter-based hash rather than a running
  // generator, so a gap's value does not depend on how many gaps came before it.
  const gapSeed = (() => {
    let h = 2166136261 >>> 0;
    for (const c of chain) { const t = String(c);
      for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } }
    return h;
  })();
  function gapNoise(i){
    let x = (gapSeed ^ Math.imul(i + 1, 2654435761)) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  }
  // /h/ HAS NO SHAPE OF ITS OWN. It is a voiceless version of whatever vowel is beside it — the
  // tongue is already in position for the "ee" in "he" and the "oo" in "who" while the /h/ is
  // still going, which is why those two /h/ sounds are audibly different. A fixed posture put a
  // mid-front tongue in the middle of every one, so "ah-h-ah" came out with a front excursion
  // in it and was reported as "hya".
  const ctxFor = (sym, i) => {
    if (sym !== 'h') return sym;
    const nxt = chain[i+1], prv = chain[i-1];
    if (nxt && !isPause(nxt)) return nxt;
    if (prv && !isPause(prv)) return prv;
    return sym;
  };
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
    // THE DRAWL BELONGS ON THE FIRST VOWEL, which is what it was described as and not what it
    // did: it landed on the first HELD segment, and in "she sells" that is the /ʃ/. At the
    // default drawl it stretched that one fricative to 190 ms against 142 for the same sound
    // later in the phrase — reported, exactly, as "sh is staticy and drawn out".
    if(first && VOWELS.has(c)){ w *= 1+drawl*2.6; first=false; }
    vw.push(w);
  });
  const wsum=vw.reduce((a,b)=>a+b,0)||1;
  const held=chain.filter(c=>!isStop(c)&&!isPause(c)).length;
  // 8.1b. `rate` makes the weights SET the word's length instead of redistributing a fixed one.
  //
  // With a fixed D the weights are normalised against their own sum, so one weight over itself
  // is 1 whatever the weight is: an isolated monosyllable cannot lengthen, and *bad* and *bat*
  // come out identical. Measured before this: coda voicing arriving at 1.17 where the
  // literature says 1.45, and "bædɪd" — both vowels before /d/ — rendering byte-identical with
  // the coda effect on and off, because an effect applied equally to every vowel of a word
  // cancels exactly against the normalisation.
  //
  // With `rate` the pool is wsum*rate and the word's length falls out of it. Nothing else in
  // the sizing changes: stops and glides still cost what they cost, and the held segments still
  // divide the pool in proportion. It is the same arithmetic with the causality reversed.
  const rate = o.rate;
  const sizeUp=()=>{
    let g=0; for(let i=1;i<chain.length;i++) g+=glideFor(i);
    const p = rate !== undefined
      ? wsum*rate                                             // the weights set the length
      : Math.max(0.12*Math.max(held,1), D-stopTime-g);        // D sets it, weights divide it
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
      // A WORD BOUNDARY IS A TRANSITION, NOT A SILENCE. This used to insert 90-300 ms of
      // `sil:1, vl:1` at every space, so every word began from true digital silence — measured
      // at 6e-12 before the /l/ of "love" and 9e-12 before the /d/ of "daughter", against
      // 2e-2 with the pauses removed. That is what was heard as a pop at each of them, and it
      // is why one knob could never dull both: the /l/ is a voiced onset and rides the
      // amplitude envelope, the /d/ is a burst and does not, but BOTH existed only because
      // there was nothing in front of them.
      //
      // Real connected speech does not stop between words. The articulators travel while
      // phonation continues, which is the thing that makes a phrase a phrase — the old comment
      // here said exactly that and then silenced it anyway.
      //
      // The silencing machinery is kept, because a real pause is real. It just needs something
      // to trigger it, and punctuation does not currently survive the speller — filed under
      // 8.4 step 4, which is blocked on the same gap.
      const nextSym=chain[i+1];
      // ── A WORD GAP IS NOT A CONSTANT ─────────────────────────────────────
      //
      // It was one number at every boundary in the phrase, and that is the most obviously
      // unnatural thing left in the model — not the wrong length, the SAME length. Measured
      // against 48 seconds of a person reading these phrases: 65 within-phrase gaps, median
      // 50 ms, quartiles 40 and 80, range 20 to 290. The model played 49 at every one of them.
      // The mean was already right. The variance was zero.
      //
      // AND IT IS SAMPLED RATHER THAN PREDICTED, which is the opposite of what I set out to
      // build. The plan was a rule — function words bind, content words separate — and the
      // recording refuses it: the same phrase read twice puts its gaps in DIFFERENT PLACES,
      // positional correlation −0.32. A 260 ms pause at position 8 in one take is 30 ms in the
      // other. Whatever put it there once did not do it again. A context rule would have fitted
      // one take and contradicted the other, and measured beautifully against whichever one it
      // was calibrated on.
      //
      // What the two takes DO agree on is the distribution — medians 45 and 40, quartiles 40/70
      // and 30/60. So that is what gets reproduced: the right spread, in an order nobody can
      // predict, because the person could not either.
      //
      // Seeded from the utterance, so a phrase sounds the same twice running and two voices can
      // still be compared on it. Real speech varies between takes; an A/B test that varies
      // between takes is not a test.
      const gBase = wgap*(1+drawl)*(BREAK_GAP[sym]||1);
      let gap;
      if (BREAK_GAP[sym]) {
        // punctuation is structure, not spread — a full stop is a decision, not a wobble.
        //
        // A HIGHER CEILING THAN A WORD GAP GETS. 0.60 s was the limit for everything, and it was
        // set to stop a runaway word gap; applied to punctuation it silently capped the longest
        // mark — an ellipsis computes to 0.92 s and came out at 0.60, the same as a full stop,
        // so the mark that exists to be dramatic was indistinguishable from the one before it.
        gap = Math.max(0.015, Math.min(1.40, gBase));
      } else {
        // ASYMMETRIC, because the measured distribution is. Quartiles sit at 40 and 80 around a
        // median of 50 — that is 0.8x below and 1.6x above, so a gap is far freer to stretch
        // than to shorten. A symmetric spread in log space gave 34/51 against the measured
        // 40/80: the right median and half the room above it, which still reads as even.
        //
        // The 1.02 lifts the median onto the measured 50 ms. It was 1.17, tuned against 57 gaps
        // from a dozen phrases — which put the median at 57 rather than 50. Over four thousand
        // draws the sampler's own distribution is visible and the number falls out directly; a
        // few dozen samples of a heavy-tailed thing is not enough to see its middle, let alone
        // its quartiles. wgap's default stays 45, since that is the knob a voice tunes and
        // moving it would move every preset.
        const u = gapNoise(i);
        const z = u*2 - 1;
        const shape = 1.02 * Math.exp(z * (z < 0 ? 0.45 : 1.00));
        gap = Math.max(0.015, Math.min(0.60, gBase * shape));
      }
      // A real pause is silent. A word boundary is not — connected speech does not stop
      // between words — but a comma or a full stop is exactly the thing that does.
      const quiet=(BREAK_GAP[sym] ? 1 : (wgap>=0.09 ? 1 : 0));
      const prev=chain[i-1];
      // WHERE THE PREVIOUS SOUND ENDED, not where it began. `shape()` goes through baseFor,
      // and baseFor for a diphthong returns the posture of its FIRST target — /ɑ/ for /aɪ/ —
      // because that is the right answer everywhere else. Here it is not: the tract has just
      // finished travelling to the diphthong's SECOND target, so "hold the previous shape"
      // snapped it 41 units back to the start in zero time.
      //
      // That is the pop. Two of them in "I love my daughter", at 310 ms and 1283 ms, which are
      // exactly the two reported — after "I" and after "my", both /aɪ/. It is also why
      // "I lovemy daughter" removes the one before the /d/: that spelling puts a plain /i/
      // before the boundary instead of a diphthong, so there is nothing to snap back from.
      const endOf = sym => isDiph(sym) ? base(DIPH[sym][1]) : base(sym);
      const pd=prev?Array.from(articulate(endOf(prev),n)):Array.from(shape('ə'));
      const nd=nextSym?Array.from(shape(nextSym)):pd;
      const pA=prev?endOf(prev):base('ə');
      const nA=nextSym?base(nextSym):pA;
      keys.push({t,d:pd,b:0,nz:0,vl:quiet,fr:0,as:0,sil:quiet,lv:1}); art.push({t,A:pA});
      // KEEP WHICH BOUNDARY THIS IS. Every boundary was pushed as a plain space, so a full
      // stop and a word gap were indistinguishable by the time buildF0 read the segments —
      // which is the same information loss the speller used to do, reintroduced one layer
      // down. The pitch reset and the question contour both look for these.
      seg.push({sym:sym, a:t, b:t+gap});
      t+=gap;
      keys.push({t,d:nd,b:0,nz:0,vl:quiet,fr:0,as:0,sil:quiet,lv:1}); art.push({t,A:nA});
      return;
    }
    const ctx=ctxFor(sym,i);
    const d=Array.from(shape(ctx));
    const A=base(ctx);
    const b=branchFor(sym), nz=nasalFor(sym), vl=voicelessFor(sym),
          fr=fricFor(sym), as=aspFor(sym);
    const lv=(stress && stress[i]===0) ? wklev : 1;
    // A SOUND NEEDS TIME TO BE MADE. At a real speaking rate the approximants were held 43 ms
    // and, measured, the tract was still 0.52 to 1.00 away from their postures at the midpoint
    // — three of the five sounds in "world" never formed. The target asks correctly; it is the
    // tract that does not arrive, so this is time rather than spelling.
    //
    // /l/, /r/, /w/ and /j/ are whole-tongue movements and cannot be made in a fricative's
    // worth of time. Turbulence needs about 45 ms of airflow before it reads as frication at
    // all, and a nasal needs a comparable stretch of murmur.
    const floorFor = c => isAp(c) ? 0.070 : FRICATIVE[c] ? 0.045 : c === 'h' ? 0.040 : 0;
    const dur=Math.max(floorFor(sym),
                       isStop(sym) ? closureFor(sym,stopHold,stopVc) : pool*vw[k++]/wsum);
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

  // A NUCLEUS IS A VOWEL. This asked whether the symbol had an entry in VDUR, which was a
  // sound vowel test right up until consonants were given intrinsic durations — after which
  // eight fricatives became syllable nuclei and could take a pitch accent. The same mistake as
  // the measurement in that commit, made in the same commit, caught in the measurement and not
  // in the engine.
  const isNuc = sym => VOWELS.has(sym) || DIPH[sym] !== undefined;
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

  // ---- DECLINATION RESETS AT A PHRASE BOUNDARY ----
  // The baseline already falls across an utterance, which is right: pitch drifts down as the
  // breath goes. What it never did is come back up, because a phrase boundary is punctuation
  // and punctuation did not survive the speller until now. So a long sentence sank to the
  // bottom of the range and stayed there.
  //
  // A speaker resets at each boundary — not all the way, and less each time, which is why a
  // paragraph still descends overall while every clause inside it starts fresh. Implemented as
  // a step that undoes the fall accumulated so far, scaled by `reset`.
  // DECLINATION IS THE DRIFT, RESET IS WHERE IT RESTARTS, and the first has to exist for the
  // second to mean anything. The baseline this sits on is flat until 55% of the utterance and
  // then falls — a good goal cry, and not how a sentence behaves. A break in the first half had
  // nothing to reset, which is exactly what a first attempt at the reset measured: no effect.
  //
  // Real declination is a steady drift downward from the beginning, a little under two
  // semitones a second, and it restarts at every phrase boundary. Implemented as one offset:
  // the fall runs from the start of the current phrase, so resetting is simply where the clock
  // goes back to zero. Each phrase resets a little less completely than the last, which is why
  // a paragraph descends overall while every clause inside it starts fresh.
  const decl = (v.decl  === undefined ? 1.8 : v.decl);   // semitones per second
  const rst  = (v.reset === undefined ? 0.7 : v.reset);
  const breaks = [];
  if(seg) seg.forEach(sg => { if(String(sg.sym).slice(0,3) === 'brk') breaks.push(sg); });
  if(decl > 0.01){
    const starts = [0, ...breaks.map(b => b.b)];
    const ends   = [...breaks.map(b => b.a), end + 0.2];
    starts.forEach((t0, k) => {
      const t1 = ends[k];
      if(t1 <= t0) return;
      // how much of the previous phrase's fall is carried into this one
      const carry = k === 0 ? 0 : -decl*(ends[k-1] - starts[k-1])*(1 - rst)*Math.pow(0.8, k-1);
      parts.push({ t0, t1: t1 + 1e-6,
                   f: t => carry - decl*Math.max(0, t - t0) });
    });
  }

  // ---- A QUESTION ENDS BY GOING UP ----
  // The one contour English speakers hear as grammar rather than as style. It rides on the last
  // stretch before the mark, and only for `brk?` — a statement and a question differ by a
  // symbol that, until punctuation survived the speller, never arrived.
  const ask = (v.ask === undefined ? 5 : v.ask);
  if(ask > 0.01) breaks.forEach(br => {
    if(br.sym !== 'brk?') return;
    const from = Math.max(0, br.a - 0.28);
    parts.push(ramp(from, br.a, 0, ask));
    parts.push({ t0: br.a, t1: end + 0.2, f: () => ask });   // held through the pause
  });

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
    // A FLOOR. Declination and the baseline's own fall compound, and nothing stopped the
    // result — the model reached 54 Hz on a voice whose bottom note is 84, an octave below
    // where the recording bottoms out at 79. A speaker runs out of range and levels off; they
    // do not keep descending until they stop phonating.
    const hz = at(t) * Math.pow(2, d/12);
    return [t, Math.max(v.f0c*0.86, hz)];
  });
}

const HOLLER = {
  ART, STOPS, VELAR, DIPH, APPROX, STOP_KEYS, VOWEL_KEYS, CONS_KEYS,
  BRANCHED, NASAL, VOICELESS, FRICATIVE, ASPIRATE,
  VOICE_SPEC, VOICES, defaultVoice, VOICE_GROUPS,
  clampVoice, mutateVoice, encodeVoice, decodeVoice,
  restingDiam, hump, articulate, baseFor, shapeFor, openedShape, buildWord, rateFor, phraseTime,
  VDUR, CODA_VOICED, CODA_SONORANT, CODA_OPEN, CODA_VOICELESS,
  UNSTRESSED, FINAL_LENGTH, POLY_SHORT, APPROX_W, codaFactor, polyShorten,
  STOP_CLOSE, closureFor, UNSTRESSED_LEVEL, buildF0, lerpHz,
  branchFor, nasalFor, voicelessFor, fricFor, aspFor, isPause, isDiph
};

root.HOLLER = HOLLER;
if (typeof module !== 'undefined' && module.exports) module.exports = HOLLER;

})(typeof window !== 'undefined' ? window : globalThis);
