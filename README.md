# Hollerbox

*How it got here, in plain language: [STORY.md](STORY.md).*

**[Open the lab →](https://johnhenryburns.github.io/hollerbox/)**

An interactive Kelly–Lochbaum digital waveguide vocal tract, running in the browser.
Forty-four cylinders at a 44.1 kHz sample rate — the count follows the hardware, so that
17.5 cm of tract stays 17.5 cm — with sound sloshing back and forth between them and the
resonances of human speech falling out of the geometry.

*A hollerbox is a box you holler out of. This one does it from first principles: no
recordings, no samples, just air, tubes and the arithmetic of a wave hitting a change
in cross-section.*

**No formant filters in the voiced path.** A vowel here is not a bank of resonators tuned to
Peterson & Barney's numbers; it is a tube shape, and the formants are whatever that tube does.
Two explicit filters *do* exist, both in the noise paths, and the honest version of the claim is
in [Verification](#verification) below — a project that says "from first principles" should be
easy to audit, not hard.

---

## What you're looking at

The vocal tract is modelled as a chain of short cylindrical tubes laid along the path
from glottis to lips. Sound travels through it as two counter-propagating waves. Wherever
two neighbouring cylinders have different cross-sectional areas, part of the wave reflects:

```
r = (A₁ − A₂) / (A₁ + A₂)
```

That single line is the whole of the *tube*. Run it 44 times in a row, twice per audio sample,
and you have a throat. It is not the whole of the model — there is also a glottal source, a side
branch for the lateral, a nasal branch, radiation at the lips and losses at the walls — but
nothing anywhere prescribes a resonance. Change the tube's shape and the resonances move on their own — which is
what a vowel *is*.

Each cylinder in the 3D view is coloured by the standing-wave energy actually present in
that section, so you can watch the pressure pattern that produces a formant.

The tube is drawn as soon as the page loads and the articulator sliders reshape it
immediately — audio just adds the wind. Starting the voice sustains **one** vowel;
**Play word** speaks anything you type, spelled by rule and by a dictionary of the words English
does not spell phonetically, and **SAY GOOOAAALLL** runs the cry it was all built for.

## Controls

Four controls sit in the dock. **Hold** voices whatever shape the tract is currently in —
a sustained vowel. **Play word** speaks the word you have built, and becomes **Stop** while
it is speaking. **Word** and **Tract** open the two panels: what to say, and how the
instrument behaves. Any of them will unlock the browser's audio on first tap.

**Tongue position** slides the constriction from the pharynx toward the lips.
**Constriction** sets how tight it is. **Lip aperture** rounds or spreads the mouth.
Between them you can reach most of the vowel space.

The shape buttons load tract geometries that were **solved, not guessed**: an offline
search over tube shapes, scored against Peterson & Barney's measured adult-male formant
data, until the simulated resonances matched. The solver independently rediscovered real
articulatory phonetics — it found that /o/ wants a back constriction plus lip rounding,
and /ɑ/ wants a low pharyngeal constriction with an open jaw.

**SAY GOOOAAALLL** animates the tract through /g/ → o → ɑ → l. The stop consonant is a
genuine seal-and-release: the tube closes at the velum, pressure builds, and the burst is
turbulence at a constriction springing open. The coarticulation between vowels isn't
scripted — it's the shape the tube passes through on the way.

## Verification

The model is checked against physics rather than against taste. A uniform tube closed at
one end is a quarter-wave resonator, so a 17.5 cm tract must resonate at odd multiples of
c/4L — 500, 1500, 2500 Hz, the neutral schwa. Measured: **500 / 1505 / 2505 Hz**, under 1%
error. The tract auto-sizes its section count to the hardware sample rate so the length
stays correct on any device.

`node lab/check.js` is the gate: assertions that must hold, in about half a minute.
`--report` adds the spectral measurements, which are worth watching and are deliberately not
allowed to fail the build — a band drawn around one calibration goes red when something is
*different*, not when something is *wrong*. Renders are seeded and reproducible, so a green
run means the same thing twice; `HOLLER_SEEDS=5` re-runs everything across five seeds.

### The honest version of "no formant filters"

The claim is about the **voiced path**, and there it is exact: source → waveguide → output, with
no resonator in between. `tract-worklet.js` line 413 makes the source, 436 runs it through
`scatter()`, 615 writes the sample. Nothing else touches it. The vowels are the tube.

Two explicit filters exist elsewhere, both on **noise**:

- a two-pole resonator on frication, giving a sibilant its peak;
- a one-pole lowpass on a stop burst, colouring the release.

Neither is a per-phoneme lookup. Both take their frequency from the **measured front cavity** —
the sibilant's centre is the quarter-wave resonance `c/4L` of however much tube lies in front of
the constriction, and the burst's corner is derived the same way. They exist because at 44
sections a sibilant's front cavity is three or four sections long, which is too coarse to ring
on its own; the code says so at the point where it does it. That is a **spatial-resolution
limitation**, not a shortcut, and finer sections would remove the need for them.

So: no prescribed resonances anywhere, and two geometry-driven filters compensating for section
count. If you were going to check one claim in this file, check that one — it is the load-bearing
one, and `grep -n "fb1\|fb2" engine/tract-worklet.js` is the whole audit.

### Two things that are easy to over-read

The solved vowel shapes are scored against Peterson & Barney (1952), whose study covers **ten**
vowels. Schwa and /o/ are not among them and are targeted against conventional values instead;
the gate reports the two provenances separately rather than claiming twelve.

Prosody — duration, stress, level, pitch contour — is **not** emergent. It is a control layer
sitting on top, with published values from Peterson & Lehiste (1960) and House & Fairbanks (1953),
and its parameters are in the voice where they can be swept. The tube is first-principles; the
timing is a model.

## Known limitation

The /l/ used to come out as a *w*. A real lateral splits the airflow around the tongue,
producing a spectral **zero**, and a single unbranched tube is an all-pole system that
structurally cannot produce one. That is now built: a short closed pocket taps into the tube at
a three-port scattering junction, and a second, longer branch at the velum — open at the far
end, because nostrils radiate — gives the nasals. Both are in `scatter()`.

What is imperfect now is everything **above** the phoneme. Individual sounds land where the
measurements say they should; what they lack is timing. Every vowel gets the same share of the
word, every stop the same closure, every syllable the same loudness, and the pitch contour is
one template stretched to fit. So the tract says the right things and reads as careful rather
than as speech. That is [Phase 8](ROADMAP.md), and it is mostly a weight table rather than more
physics.

## Where this is going

The working plan is in [ROADMAP.md](ROADMAP.md): build the iteration rig first, then the
lateral branch, then a pressed-phonation glottal source, then prosody. The short version is
that the only thing which can judge a goal cry is a human ear, so the first job is making
evaluation cheap rather than making the cry better.

## Background

This started as an attempt to synthesize a stadium goal cry for a
[three-sided football simulator](https://github.com/JohnHenryBurns/three-sided-football),
went through nine iterations of formant synthesis that variously sounded like a ghost, a
sasquatch, a cow and a sheep, and ended up here. The write-up of that journey — including a
retracted finding — is in that repo under `docs/AUDIO-EXPERIMENT.md`.

## Relation to other physical models

Karplus–Strong, the standard plucked-string algorithm, is the same family: sound in a
one-dimensional medium as two travelling waves, simulated by delay and filtering. Julius Smith
formalised both as digital waveguide synthesis. A string is uniform so a single delay loop
suffices; a vocal tract changes cross-section, so it needs a scattering junction at every
boundary — hence 44 of them here.

Make every section of this tube the same diameter and the reflection coefficients vanish,
leaving a plain delay loop. Then only the ends decide what it is: with one end open it
resonates at 500/1505/2505 Hz (odd multiples of c/4L — a stopped tube), and with both ends
reflecting at 1000/2005/3005 Hz (the full harmonic series of a string). Same code.

## Reading

- Kelly & Lochbaum (1962), *Speech Synthesis* — the waveguide model
- Fant (1960), *Acoustic Theory of Speech Production* — source–filter
- Klatt (1980), JASA — the cascade/parallel formant synthesizer
- Fant, Liljencrants & Lin (1985) — the LF glottal flow model
- Peterson & Barney (1952), *Control methods used in a study of the vowels*, JASA 24(2):175–184
  — the vowel formant measurements used to solve these shapes. Their study covers ten vowels;
  schwa and /o/ are not among them and are targeted against conventional values instead.
- Neil Thapen's [Pink Trombone](https://dood.al/pink-trombone/) — the articulatory
  synthesizer that showed this could live in a browser tab
