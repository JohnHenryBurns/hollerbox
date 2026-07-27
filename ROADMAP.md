# Roadmap

**Status and open items only.** What is built, what is not, what is known to be broken.

Findings, measurements and the reasoning behind a change go in the **commit message** — which is
permanent, attached to the change it describes, and cannot conflict with another branch. They are
already written there. This file used to carry a third copy of every one of them, and fourteen of
the last fifteen commits added twenty to fifty lines to it. That is where the merge conflicts came
from: not from anything structural, but from every branch writing a narrative into one shared file.

So: a change updates this file when a **status** changes — a phase completes, a fault opens or
closes — and that is one or two lines. If a change wants a paragraph here, the paragraph belongs
in the commit message instead.

`git log --grep` searches all of it.

Eighteen sections were removed on that basis — every one a narrative of something now fixed, and
every one already in a commit message: the pops, the teleport, the stale-engine deploy, the John
rebuild, the /dʒ/ chase, the fitting harness, the two Phase 8 verdicts. What stayed is status,
open faults, reference tables, and the listening record.

---

**The goal:** a synthesized stadium goal cry, produced entirely by physical modelling, that a
room full of people would accept as a human being shouting.

**Where we are:** the tract produces recognisable vowels — nine of the eleven English
monophthongs land within 6% of Peterson & Barney's measured formants — and the /g/ is a real
seal-and-release. But the word currently comes out, in the project's own field notes, as
*"Goooo aaaa uuuwwll."* The vowels are there. The consonants and the vocal effort are not.

---

## The front end, rethought  ❌ a vision and a plan, nothing built

`index.html` is two thousand lines doing four jobs — word editor, knob panel, spectrogram, tract
animation — and the animation, the thing worth showing anybody, has the fewest references of the
five. Advanced is a button rather than a place, so a stranger's first sight is a phoneme keyboard,
forty knobs and a word that says *goal*.

**VISION.md** has the shape: a front door that opens on the throat saying a famous line, and four
rooms behind it — make a voice, look inside, build a word, the lab. Five phases, the first of
which is a bug: five of the wizard's controls have no event listeners at all.

## Front end: one session, three views  ❌ planned, not started

Three pages hold their own copy of loading the engine, starting the audio, holding a voice and
turning text into sound — so the same voice saying the same phrase behaves differently depending
which page you are on. `johnfit`'s 26 fitted postures are never applied in the wizard; the Austen
passage runs 6.62 s on the main page against 8.77 s on the other two.

Four phases in **FRONTEND.md**: one speak path, one engine and start, the shared voice and phrase
selector, then state that survives navigation.

## What is next, in order

1. **Stiffness is keyed on the wrong thing.** `stiff = target < artCrit ? max(floor, target/artCrit) : 1`
   asks how NARROW a gesture ends up, which is right about precision of CONTACT — a sibilant
   groove is millimetres — and wrong about precision of SHAPE. The consequence, named three
   separate ways from three different symptoms:

   - /l/, /r/ and /w/ get the slowest articulators in the model while needing the largest
     tongue movements. Still 0.48 out of position with a 90 ms duration floor. This is what
     "telo norgut" was.
   - The wide parts of the tract sit 0.25 out, which raising `artCrit` to 2.0 only half fixed.
   - Duration floors keep helping a little and never enough, because time is not what is short.

   Key it on how FAR the articulator has to travel instead. One function, and it should move
   approximants, vowel transitions and the wide-part error together.

2. **The range** — ✅ both halves addressed.

   *Loudness.* Every class of sound sat within **2.3 dB** of every other where a real fricative
   is 10 to 30 dB below a vowel. Fricative gains are at real levels now: contrast on "she sells
   sea shells" is **19.0 dB against a person's 20.7**, from 12.1.

   *Pitch.* The shortfall was entirely **upward**. A person's pitch runs 3.7 semitones below its
   own median and **9.6 above**; the model ran -4.1 and **+2.6**. The downward half was already
   right — the accents never lifted anything, because `acc` was 3 semitones where a real
   conversational accent is 5 to 8. Now 7, giving +5.3, and the ceiling is 14 so an expressive
   voice can reach what an expressive reading does.

   *Still open:* /ʒ/ cannot be both quiet and mostly-frication — at a gain low enough for -16 dB
   it is 82% voice, at one voiced enough to pass the balance check it is -5.6 dB.

## What the gate is for  ✅ reorganised

**A voice is data. No voice should be able to fail the gate.**

Thirty of the checks read a tuned preset — `{...defaultVoice(), ...VOICES.john.v}` — so retuning
John could fail the build. That is backwards: a preset is numbers somebody chose by ear, and the
engine is what is under test. Pointing all thirty at the spec defaults broke **two**, so
twenty-eight were borrowing for no reason at all.

Three rules, all of them arrived at by being bitten:

1. **Construct the voice you need; do not borrow a preset.** If a check depends on a low pitch or
   a short tract, say so: `{ ...defaultVoice(), f0a: 88 }`. That states the dependency instead of
   inheriting whatever a preset holds this week.
2. **Compare against the knob, not the number it happens to hold.** A check reading `accent === 3`
   failed the moment 3 became a realistic 7, reporting a correct excursion as wrong.
3. **Gate invariants, report calibrations.** "A stop must seal", "no sound may be silent", "a seed
   must round-trip" hold for any voice in the legal space. "A fricative is 22% of a vowel" is a
   measurement of one tuning — and gating it caused the gains to be tuned UP to satisfy it, which
   is how every class of sound ended up within 2.3 dB of every other.

One deliberate exception, marked where it sits: the wizard check tests options defined as patches
over the wizard's own base voice, so testing them against anything else tests nothing.

A check enforces this. 56 gate, 17 report.

## The output was 24 dB quiet  ✅ fixed

Reported as the whole thing being faint with the phone volume all the way up, and it was. Every
voice peaked between **-13 and -24 dBFS** where a normal recording peaks near -8, so roughly
24 dB of range went simply unused.

**Nothing recent caused it.** Reverting every change of the previous few sessions — the fricative
levels, the voicing duck, the accents, the stiffening — recovers under 2 dB between them. The
model had always been quiet and no one had measured it against anything.

A flat gain with a hard clamp cannot both lift the quiet voices and protect the loud ones,
because the spread between them is 11 dB. Soft saturation can: linear where the signal already
lives, bending smoothly rather than squaring off a peak. Hard clipping a waveguide sounds like a
fault; saturation sounds like a loud voice. Under 0.01% of samples reach the bend.

Every voice now sits between -10.5 and -2.2 dBFS. A person reading the same phrases peaks at -8.2.

## Checks that pushed the model the wrong way

Three in one session, and the pattern is the same each time: a check encoded a value or a
mechanism that was correct when it was written, and then held the model to it after the ground
moved.

- **The fricative floor** required every fricative to reach 22% of a vowel — -13 dB, where a
  real /ð/ is at -30. Gains were tuned UP to satisfy it, and the result was a model where every
  class of sound sat within 2.3 dB of every other. Wrong in kind too: a fricative is audible
  because of its high-frequency contrast, not its loudness.
- **The accent excursion** was compared against a hardcoded 3, which was the default when the
  check was written. Raising the default to a realistic 7 made a correct excursion report as
  wrong.
- **The gesture knobs** were asserted load-bearing for sealing a stop, and stayed asserted after
  a better mechanism — stiffness following travel — took the job over.

None of these were wrong when written. The lesson is narrower: **a check should compare against
the knob, not against the number the knob happened to hold.**


3. **Vowel quality in the speller** — ✅ the systematic faults are fixed.

   *Unstressed vowels reduce to schwa*, with four exceptions: diphthongs do not reduce (tomato),
   word-final /i/ from `<y>` is a full vowel (happy), /ɝ/ is already reduced and sending it to
   schwa would delete the r (other), and an unstressed /ɪ/ resists in a CLOSED syllable (cabin,
   rabbit) while giving way in an open one (family).

   *A magic e now makes the vowel English actually has.* Every other magic-e vowel in the table
   produced a diphthong — a gives eɪ, i gives aɪ — and **o alone gave a bare monophthong the
   language does not use there**, so note, hole, rose, stone and every past tense built on one of
   them was wrong. The rule four lines below it, for go and no and hello, had /oʊ/ right the
   whole time.

   *`-le` is a syllable only after a consonant* — little and table, not hole and pole, which were
   coming out /hoʊəl/. A rule may now test what SOUND came before it, which is what such a rule
   always meant.

   *`-ose` and `-ise` are voiced* — rose, nose, chose, wise, rise — while `-ase` and `-use` are
   not: case, base, goose.

   *Still wrong, and individual rather than systematic:* "whole" has a silent w; "apple" reduces
   its first vowel because WEAK_FIRST matches the "ap"; "sofa" gives /ɑ/ for /oʊ/; "camera" drops
   the r of /kæmərə/.


4. ~~/ð/'s noise peaks at 9500 Hz.~~ **Mis-stated, and the real fault was next to it.** /ð/'s
   noise is at 5384 Hz, alongside /θ/'s 5471 — the place is correct. As *spoken* it reads 929 Hz
   because its frication gain is 0.010, the quietest sound in English by design, so what is heard
   is almost entirely voicing. That is the already-recorded /ð/ problem, not a spectrum fault.

   **What was actually wrong: /ʒ/ was made in the wrong place.** Its tongue tip sat at 0.862 —
   the alveolar position, where /z/ is made — against /ʃ/'s 0.842, with a third of /ʃ/'s lip
   rounding. Both raise the resonance, and its centroid came out at 4450 Hz against /ʃ/'s 2865,
   in /z/'s territory. A voiced and voiceless pair is one posture with the folds on or off. Now
   2852 against 2791.

   Checking that found two more: /s/-/z/ and /θ/-/ð/ also disagreed on lip aperture. All four
   pairs match on place and rounding now; channel width stays independent, since a voiced
   fricative really does have a slightly narrower one.


5. **The affricate.** "Jump" is *doo-ump*: /dʒ/ is spelled d+ʒ and rendered as two segments
   where a real affricate releases a stop INTO friction, as one gesture.

**Held deliberately: the pops.** Real, reported by ear from several voices, and seven
instruments have now failed on them — the last one turned out to be pure noise, varying 4.5x on
the seed alone. **The first job there is a metric that survives a seed control**, not an eighth
hypothesis.


## Where it stands

| | |
|---|---|
| **Sounds** | 39 — 12 vowels, 5 diphthongs, 22 consonants |
| **Voices** | 9 presets plus Custom, two of them measured from a real speaker |
| **Voice vector** | 18 parameters, **36-character seeds**, carrying source, timing, tract length and fold model |
| **Gate** | 22 checks, `node lab/check.js` — subsettable, streaming, parallel |
| **Engine** | one copy, `engine/tract-worklet.js`, loaded by URL and read by the harness |
| **Phonemes** | one copy, `engine/phonemes.js` — shared by the app, the bench and the gate |
| **Bench** | `lab/bench.html` — sweep, blind test, minimal pairs, render-all-to-WAV |
| **Live** | johnhenryburns.github.io/hollerbox |

### Vowels are solved. Consonants are the work.

Vowels land within 12% of target: **10/10 against Peterson & Barney's measured adult-male
means**, plus schwa and /o/, which P&B did not measure, against conventional values. A labelled
ɑCɑ sweep on voice=john scored
**1 / 22** on consonants. That is four root causes, not twenty-two:

| # | fault | state |
|---|---|---|
| 1 | No VOT — p/t/k heard as their voiced partners | ✅ fixed in `ee87eea` |
| 2 | Velar bursts fronting: g→d, k→t | ✅ fixed in `ee87eea` |
| 3 | Every fricative reads as undifferentiated hiss although the centroids are right (/s/ 4700 Hz, /ʃ/ 3000). Likely **level** — /s/ peaks around 3× the vowels | open |
| 4 | The nasal side branch is ~1.6 cm where a real nasal tract is 10–12, so there is no antiformant. /m n ŋ/ collapse to a generic voiced continuant and drag /z ð l r j w/ with them | open — biggest job, do it last and alone |

**Re-swept against `ee87eea`**, ɑCɑ, voice=john, 16 renders averaged:

*Voicing (VOT, ms).* Voiced stops unmoved at 10–15; voiceless were bunched at ~43 ms, inside
the voiced band, which is exactly why they were heard as /b d g/. They now sit at **75 / 80 /
105** for p/t/k, and in the right order — labial < alveolar < velar — so VOT now carries place
as well as voicing.

*Place (burst peak, Hz).* Before, all three voiceless bursts pinned to the bottom of the scan:
one dark thump, place erased. After: /p/ diffuse and low, **/t/ 4400**, **/k/ 2000**. The three
places separate.

Both fixes hold. What has *not* been done is the blind re-listen in `bench.html` — the ear is
still the judge, and the sweep score has not been re-taken.

*(An instrument note, because this project keeps being misled by its own: the first burst
measurement read 400 Hz for every stop on both builds. That was F0 and the voice bar swamping
the window, not a burst. Measure burst place above 800 Hz.)*

Built: the A/B tournament, the lateral branch, the articulatory layer, the LF source,
nasals, voiceless stops, fricatives, spelling-to-sound, the voice library, per-voice
articulation, source–tract interaction, and two-mass folds.

Not built: prosody beyond a pitch arc (Phase 4), finer sections (7c), and frequency-dependent
losses — which was attempted, measured, and reverted.

---

## The problem behind the problem

Every iteration so far has run on the same loop: change a parameter, render, listen, describe
the result as an animal, change another parameter. That loop produced nine versions of the
earlier formant synth and a document full of retracted findings. It is slow, and it burns the
one genuinely scarce resource in this project — a human ear that can tell whether something
sounds like a person.

The objective function lives in that ear. Nothing else can evaluate it. So the first job is not
to improve the cry; it is to **make evaluation cheap**.

That principle orders everything below.

---

## Why it sounds the way it does

A note from testing, which turned out to be the most useful framing anyone has offered:

> *"It sounds like the way deaf people who have learned to speak sound. Which is very close to
> the truth of how this is built."*

That is not a simile, it is a diagnosis. Speech learned without hearing tends to get
articulatory **targets** right — where the tongue goes is teachable — while timing, prosody,
nasal control and laryngeal quality drift, because those can only be tuned by hearing yourself
and correcting.

This synthesiser has precisely that profile. Formant targets are solved against measured data,
so place of articulation is correct. Timing is scripted uniformly. The pitch arc is invented.
There is no velopharyngeal control at all. The glottal source is a generic pulse with no model
of vocal effort.

The common cause is the same in both cases: **speech produced without auditory feedback.**

This changes what Phase 1 *is*. The A/B rig is not a convenience for tuning faster. It is the
missing feedback loop, with a human ear closing it — the one thing the model has never had.

---

## Phase 1 — the iteration rig

*Nothing else should start before this exists.*

### 1a. Offline sweep and scoring

A harness that renders hundreds of parameter combinations to audio and scores each one on the
things that have objective answers:

| measure | what it catches |
|---|---|
| formant trajectory vs target | is it saying the right vowels, at the right times |
| burst energy at release | is the /g/ actually a stop |
| spectral zero near F2 during /l/ | is the lateral real (Phase 2 gate) |
| AM depth in the 4–9 Hz band | the sheep. Never again |
| H1–H2 | pressed vs breathy phonation — vocal effort |
| spectral tilt | shout brightness without buzz |

This prunes the parameter space without a human hearing a single rendering. Anything that fails
these never reaches the ear.

### 1b. In-browser A/B tournament  ✅ built, and moved to the bench

It lived in `index.html`, which was the wrong place twice over. The app is a demonstration; the
bench is where the listening tests are. But tidiness was not the reason:

- **It could only say one word.** Tuning prosody on a single word cannot show you what prosody
  does, and half the parameters it can now reach — accent depth, unstressed level, final
  lengthening, polysyllabic shortening — do nothing measurable inside one syllable. It now runs
  against any of the twelve bench phrases.
- **It mutated every parameter at once.** That was already a lot at eighteen and is twenty-eight
  now. Change all of them and ask an ear "was that better" and the answer cannot be attributed
  to anything; you learn almost nothing per round. It now mutates **one named group**.

The groups partition the spec — every parameter in exactly one, gated. A parameter in no group
is unreachable and would never be tuned; a parameter in two would move twice as far per round as
its neighbours and nobody would work out why.

| group | | |
|---|---|---|
| `source` | 7 | rd press jit brth folds damp lipR |
| `pitch` | 4 | f0a f0b f0c pert |
| `stress` | 3 | wkdur wklev acc |
| `rhythm` | 10 | per drawl glide stopT vlen coda fnl poly stopVc apw |
| `tract` | 4 | sect open burst hiss |

**`stress` is deliberately the three cues together** — duration, level and pitch accent. Those
are exactly the three that confound each other, and dialling any one alone means over-dialling
it to cover for the other two. That is the sweep this roadmap said to run once accent alignment
landed, and it is now one selection in a dropdown.

**Reset goes back to where you started, not to the spec defaults.** Reported: *"seems it's not
going back to the default voice"*. It wasn't. The tournament OPENED on `{...defaults, ...VOICE}`
— John, if John was selected — and Reset jumped to the bare `defaultVoice()`, which is a voice
you had never been at. Start and reset disagreed.

Two buttons now. **Reset group** puts only the current group back to where that group's search
began, so tuning `source` survives resetting `stress`. **Reset all** returns to the voice the
tournament opened on. `tOrigin` and `tStart` are the two snapshots that makes possible.

**The champion is the bench's voice now.** It used to be restored in a `finally` after every
preview, so nothing outside the panel ever saw it: you could tune for twenty rounds, switch to
Phrases to hear it in another context, and get the untuned voice back with nothing on screen
saying why. Only *Copy seed* reflected the champion. Committing a champion writes it through,
A/B previews are temporary against it rather than against whatever was there before, and opening
the panel adopts whatever the voice currently is — so an edit made in Knobs is picked up instead
of silently discarded.

**The phrase rotates by default.** Tuning against one phrase overfits to it: the `stress` values
that win on *banana and a tomato* — three weak syllables around one strong — are not the ones
that win on *bad bat bed bet*, which has no unstressed syllable in it at all. With a human in the
loop and twenty rounds you would not find that out until everything else sounded worse. A and B
stay on the same phrase **within** a round, so the comparison is still fair; the champion just
has to keep winning across the inventory. A single phrase is still selectable when you are
chasing one specific fault.

Changing group resets the search width, because a narrow setting earned by converging on one
group is meaningless in a space nothing has been heard in yet. The panel also prints **what
moved** each round; without that a round is a black box, and you would be picking a winner with
no idea which knob won it.

`clampVoice`, `mutateVoice`, `encodeVoice` and `decodeVoice` moved to `phonemes.js` beside
`VOICE_SPEC`, since they are pure functions over it. The seed codec had **two** copies — the
page's and one this gate had written for itself, which is a gate testing its own
reimplementation rather than the thing. Structurally asserted now, because that is the only
kind of check that stops it recurring.

### 1b. Original note

Hear variant A. Hear variant B. Tap the better one. The app mutates around the winner and
serves the next pair. Eight to ten taps converges somewhere slider-dragging never would.

This is the correct tool when the judge is a human ear, and it puts every second of listening
time onto perceptual questions rather than measurable ones.

### 1d. Every knob reachable  ✅ built

Advice of the form *"turn `acc` to zero and listen"* was unfollowable: **five of twenty-eight
parameters could be set by hand anywhere in either page**, and none of the Phase 8 ones. The
tournament explores but cannot set a value, and building a seed by hand means computing base-36
offsets. So the bisection story the prosody knobs were designed around had nowhere to happen.

A **Knobs** panel in the bench: all twenty-eight, live, grouped the way the tournament groups
them, each with a reset and — where one exists — a **∅** that sets it to its null.

The null is declared in `VOICE_SPEC` as `off`, not written into the UI, because it is a fact
about the parameter rather than about a button. Sixteen have one; a `p8` flag marks the nine
that make up the Phase 8 prosody layer, so **Phase 8 off** nulls the lot in a single action.

**That is the comparison worth having**, and it is gated: with the layer nulled, every held
segment is the same length, every stop takes exactly `stopHold`, every level is 1 and the pitch
contour is the bare baseline — the engine as it behaved before 8.1. The check also asserts the
opposite, that with Phase 8 *on* none of those hold, because a switch that nulls a layer which
was doing nothing anyway would pass the first half and mean nothing.

### 1e. Playing from where you are  ✅ built

Tuning by ear is play, tweak, play. The Knobs panel could not play anything, so hearing a knob
move meant changing tab and coming back — long enough a loop that you stop doing it, which
defeats the panel. A phrase selector and a **▶ play** now sit at the top of it, and `sayPhrase`
takes the element to write the chain into so both panels can share it.

Two keyboard bugs found on the way:

**The space bar did nothing in three of six modes.** It clicked `#play` unconditionally, which
lives in `paneTrial` — hidden in knobs, phrases and tournament. Now routed by mode: `pab` in
pairs, `kPlay` in knobs, `tA` in tournament, `phraseGo` in phrases.

**And there was no guard against typing.** The global handler called `preventDefault()` on space
regardless of focus, so the free-text phrase box could not accept a space — *"hello world"* was
untypeable in it. Guarded now, with range inputs and selects deliberately *excluded* from the
guard: space does nothing useful on either, and the knobs workflow is move a slider, hit space,
listen, move it again.

### 1c. Seed codes

Any cry can be saved, shared and returned to as a short string. Without this, a good result
found at 11pm on a phone is gone by morning.

**Done when:** a full tournament round — render, compare, choose, mutate — takes under a minute
on a phone, and a winner can be recovered exactly from its code.

---

## Phase 2 — the lateral branch  ✅ built

The /l/ is the largest intelligibility defect. It reads as a *w*.

A real lateral splits the airflow around the tongue and rejoins it, which places a **zero** in
the transfer function. A single unbranched tube is an all-pole system: it is not that our /l/
is badly tuned, it is that this geometry **cannot produce a lateral at all**.

The fix is a side-branch waveguide — a second short tube coupled at a junction, with its own
scattering. It is the same mechanism that produces nasals, so /m n ŋ/ come almost free
afterwards.

**Built.** Three-port scattering junction (pj = 2·Σu⁺/ΣA, u⁻ᵢ = Aᵢ·pj − u⁺ᵢ), verified to
reduce exactly to the two-port form when the branch is shut so it cannot disturb the validated
tract. The lateral was then re-solved *with* the pocket coupled: tongue-tip constriction at
u=0.74, a 12-section closed pocket tapping it. Measured in the shipping engine: a **−33.7 dB
notch at 1950 Hz**, and F2 lifted clear of /w/ territory. The same mechanism, with an open far
end at the velum, gives the nasals in Phase 5.

**Original criterion:** the spectrum during /l/ shows a measurable anti-resonance, and the F2 trajectory
stops rising into *w* territory at the end of the word.

---

## Phase 2b — the articulatory layer  ✅ built

The tract is currently parameterised abstractly: *a constriction somewhere, this wide, this
tight.* It reaches the vowels, but it does not know what a tongue is — which is how the solver
once handed back a lateral with **rounded lips**. Nothing in the model said lips and tongue are
different organs.

Replace that with six things a person actually has: **jaw, tongue body position, tongue body
height, tongue tip, lip aperture**, and later the velum.

**Feasibility, measured before committing:** an articulator model reaches **9 of 11 English
vowels within 10%** — the same accuracy as the abstract parameterisation. More tellingly, the
articulations it found are correct without being told any phonetics: /i/ came out high and
front, /ɑ/ low and back with an open jaw, /u/ with rounded lips, and schwa with the tongue at
rest and the jaw nearly closed. That is the vowel quadrilateral, recovered from tube acoustics.

**What it buys:**

- **Impossible solutions become impossible.** A tongue cannot be in two places, and lips are
  not part of it. The rounded-lip lateral could not have been proposed.
- **Six shared parameters instead of sixty-five.** Every phoneme currently carries five
  abstract numbers of its own. Articulators are shared, so the search space means something.
- **Coarticulation stops being interpolation.** A tongue has mass and cannot teleport;
  transitions become physical rather than linear blends between abstract shapes.
- **The picture becomes the point.** A mid-sagittal view — palate, tongue, jaw, lips — driving
  the area function that drives the tubes. You watch the tongue make the vowel.

**Done when:** every phoneme in the inventory is expressed as articulator positions, and the
mid-sagittal view and the tube view are two renderings of the same state.

### Does this break the rest of the plan?

No, and it helps three of the remaining phases:

| phase | interaction |
|---|---|
| **1 — tournament** | Untouched. The tournament tunes the *voice*; articulation belongs to the *word*. Seeds stay stable. |
| **2 — lateral branch** | Improved. The branch taps wherever the tongue tip is, instead of a hand-solved position — and the rounded-lip failure becomes unreachable. |
| **3 — LF source** | Orthogonal. The source sits upstream of the tract and does not care how the tube got its shape. |
| **4 — prosody** | Improved. Articulator mass gives transition timing a physical basis rather than a tuned constant. |
| **5 — rest of English** | Substantially helped. Nasals need a **velum**, which is an articulator. Fricatives need turbulence injected *at the constriction*, and an articulatory model knows where the constriction is by construction. |
| **library** | Improved. A word becomes a sequence of articulator targets — smaller, and portable across voices. |

The one real cost is a one-time re-solve of the whole phoneme inventory in articulator space,
plus a likely small accuracy loss on the rounded back vowels, which want finer lip modelling
than a single aperture parameter provides.

---

## Phase 3 — the shout source  ✅ built

The glottal source is currently a Rosenberg pulse. That is a model of **speech**.

A shout is not loud speech. It is *pressed phonation*: higher subglottal pressure, more abrupt
glottal closure, a different spectral slope, and more energy in the upper harmonics. Turning up
the gain on a speech source produces loud speech, which is why the cry still sounds like a
synthesizer rather than a person.

The replacement is the **LF model** (Fant, Liljencrants & Lin 1985), which parameterises the
derivative of glottal flow. Fant's later `Rd` collapses its shape onto a single knob sweeping
breathy → modal → pressed. One control, physically grounded, measurable through H1–H2.

This is the most likely single change to move the result from *instrument* to *person*.

**Built.** LF implemented with Fant's Rd mapping, eps and alpha solved by Newton iteration at
parameter-change time rather than per sample. Verified inside the shipping engine: H1-H2 runs
from **-5.3 dB at Rd 0.4 (pressed) to +12.8 dB at Rd 2.2 (breathy)**, matching published ranges.
Effort is linked: Rd falls toward the pressed end at the peak of a word, so a shout presses
rather than merely getting louder. Rd and press replaced the two Rosenberg knobs in the voice
vector, so seeds still load positionally.

**Original criterion:** H1–H2 sits in the pressed range at peak effort, and the source can sweep from
breathy to pressed without the tract changing.

---

## Phase 4 — prosody  ◐ partial

The shape of the shout over time: the onset, the climb, the sustained strain at the top, the
fall at the end. Roughly six parameters — pitch arc, effort arc, drawl distribution, final
descent, and the amount and rate of roughness.

All of these are perceptual. None of them should be guessed. They are exactly what the Phase 1
tournament is for.

**Done when:** the ear says so.

---

## Phase 5 — the rest of English  ✅ built

**5a built.** The nasal tract is a second branch — 11 cm, open at the nostrils — coupled by a
velum parameter. /m n ŋ/ are the /b d g/ closures with the velum open, and they measure as
proper murmurs (F1 330/380/415 Hz). One anatomical bug worth recording: the velopharyngeal port
was first placed at u=0.57, *downstream* of a velar closure, which sealed the nose off from the
glottis and left /ŋ/ completely silent. It has to sit upstream of the closure.

Voiceless stops are the same articulations with the folds apart: voicing gated to zero during
closure and a release about four times stronger, because a /k/ is aspirated where a /g/ is not.

The inventory is now **22 phonemes**, and *Maximus* is down to a single missing sound class.


Everything above serves one word. This phase makes the instrument general.

The current inventory is twelve vowels plus /l b d g/, which is enough for **goal, gold, ball,
bulldog, dad, good, bird** and any other word built from voiced stops and vowels. It is not
enough for most names. Taking "Maximus" — /m æ k s ɪ m ə s/ — as the worked example, three
things are missing, and they differ enormously in cost:

| missing | what it needs | cost |
|---|---|---|
| /m n ŋ/ nasals | side branch coupled at the velum | ✅ **built** |
| /p t k/ voiceless stops | existing closure, voicing gated off, aspiration on release | ✅ **built** |
| /s ʃ f θ/ fricatives | sustained turbulence at a constriction, plus the short front cavity that gives sibilants their resonance | ✅ **built** |

Note the ordering that falls out of this: **Phase 2 pays for the nasals as a side effect.** The
branched waveguide built to fix the /l/ is the same mechanism that opens the velopharyngeal
port. Voiceless stops are close to free once it exists — the tube already seals and releases;
what changes is that the glottis is quiet and the burst is aspirated rather than voiced.

Fricatives are the genuine addition. A noise source has to be injected *at* the constriction
rather than at the glottis, with its level driven by the pressure drop and the constriction
area, and sibilants need geometry fine enough to resolve the small cavity in front of the teeth
that puts /s/ up around 4–8 kHz. That may also force a higher section count.

**5b built.** Turbulence is generated at the constriction and injected *forward*, so only the
cavity in front of it shapes the result — which is the whole reason /s/ is high and /ʃ/ lower.
The /s/ articulation was solved for a narrow gap well forward (tip at u=0.91, gap 0.18) leaving
a 1.6 cm front cavity. Measured: peak in the sibilant range with 70% of energy above 3 kHz.
A **hiss** parameter joined the tournament.

**Done — the app says names it was never tuned for.** Inventory 26 phonemes.
*Maximus, Solana, Max* all render clean.

**Original criterion:** the app can say a name it was never tuned for.

---

## The voice library  ✅ built

**A voice is now one vector, and a seed is the whole voice.** Seventeen parameters covering
source (Rd, effort, jitter, breath), radiation, timing (seconds per sound, drawl, glide, stop
hold), the burst and hiss, the vowel opening, and **tract length in sections**. Thirty-four
characters. Every preset round-trips exactly, which means a tuned voice can be handed back as a
string and baked in as a default.

Current preset seeds. Paste one into the Lab to restore that voice exactly, or hand a tuned
one back to be baked in as a new default:

```
    Goal announcer  2aulgsqnawl6gpc67imbafci4ad9se26qq00
    John            fz6hc0qnawk41514192wafci4ad9om1t1j00
    John shouting   3issflqnawnab87g3xllafci4ad9om26qq00
    Man             aj6hc0qnawj22b2q272wafci4ad9ub1t3m00
    Woman           ft5ec0qnawm8hahmgw2wafci4ad9ls1t3m00
    Child           hk4bflqnawnar2rar82wafci4ad9g31t3300
    Helium          aj6hc0qnawj22b2q272wafci4ad94q1t3m00
    Whisper         z300llqnawri77777u3mafci4ad9se135500
    Barry White     7k7xd7wiawj200000051afci4ad9w73m5500
```

Presets ship as complete vectors; **Custom** is what you get the moment you touch a slider or
choose in the Lab, and it reveals the timing and tract-length editors. Everything else stays
hidden, because a preset that can be half-edited is a preset you cannot trust.

One caveat worth stating: **per-phoneme articulation is still global.** The tongue postures for
/o/ or /s/ are shared by every voice; only the tube length changes. Making postures per-voice —
so a child rounds differently from an announcer — is a further step, and probably the right one
eventually.

Voices are presets over source *and tract length*, because length is what makes a voice read as
a man, a woman or a child — pitch alone does not. Measured on /ɑ/: 17.5 cm gives 680/1070,
14.7 cm gives 815/1280, 12.3 cm gives 980/1535. Those ratios are exactly the length ratios, and
they land on published adult-female and child data.

Helium is the same knob by another route, and the best demonstration in the app: the gas carries
sound faster, so the same source at the same pitch rings an acoustically much shorter tube.
Source and filter come apart audibly.

Shipping: **Goal announcer, Man, Woman, Child, Helium, Whisper.** Any voice can say any word.

---

## Phase 6 — words from spelling  ✅ built

Typing *Maximus* and having it work, instead of tapping out `m æ k s ɪ m ə s`.

**The catch is ordering.** Grapheme-to-phoneme is only useful once Phase 5 exists. Today the
inventory is twelve vowels and four consonants, so a converter would spend most of its time
reporting phonemes the model cannot pronounce. It belongs after the rest of English, not before.

**The approach**, in increasing cost:

1. **A hand-written dictionary.** For a family project this is not a compromise, it is the
   right answer for the words that matter most. Names are exactly where automatic conversion is
   worst, and there are perhaps thirty that count.
2. **Letter-to-sound rules.** The NRL rule set (Elovitz, Johnson, McHugh & Shore, 1976, NRL
   Report 7948) is the classic: 329 rules, and the report claims correct pronunciations for
   about **90%** of words in average text. Later independent evaluations put practical accuracy
   lower, and names are much worse than either figure. *(Corrected: this used to say the rules
   are "still used in eSpeak" and cite 70–85%. eSpeak ships its own per-language rule files and
   no source connects it to the NRL set, and 70–85% was not the report's own number.)*
3. **Rules plus an exception list**, which is what practical systems actually ship. The
   exception list is the dictionary from (1), and it grows every time someone corrects it.

**The feature that makes it work regardless of accuracy:** show the phonemes it chose, let them
be edited by tapping, and remember the correction. Then a wrong guess costs one tap and is wrong
only once. Given that the words we care about are family names, the personal dictionary will
outperform any general converter within a week of use.

**Usable before Phase 5:** the same machinery answers *"can this word be said yet?"* — which
turns the missing-phoneme list into something concrete rather than abstract.

**Built.** Rules first (digraphs, magic-e, soft c and g, common endings), then a personal
dictionary in local storage that overrides them. Five approximants — /w j r h v/ — were added
to make English spelling reachable; they are vowel postures with no closure, so they cost
nothing. Every test word came out sayable, with the expected failures on names: *solana* rules
to `s ɑ l æ n æ` rather than `s o l ɑ n ə`. Correcting it takes one tap and holds.

**Done — a name can be typed, corrected once if needed, and spoken thereafter.**

---

## The calibration library

A/B tournaments should not produce one good goal cry. They should produce a **voice**.

The parameters divide cleanly, and this division is what makes a library possible:

- **A voice** is the source and expression: glottal shape, effort arc, pitch range, roughness,
  brightness. It is completely word-independent. *"Stadium shout", "announcer", "small child",
  "grandfather".*
- **A word** is a phoneme sequence and its timing. It is completely voice-independent.
  *goal, bulldog, Maximus.*

They compose. Any voice can say any word. A tournament tunes a **voice**, and every word in the
library immediately inherits the result — so the listening effort spent perfecting the goal cry
is not spent again on the next word.

That means the seed code from Phase 1c should encode the pair — `voice:word` — and the library
is simply two lists that multiply.

The near-term consequence: tune the stadium-shout voice on *goal*, because it is short and we
know what it should sound like. Then point it at *bulldog*, and later at the kids' names, and
the hard-won calibration comes along for free.

---

## Which parameters go where

The split matters, because it decides what costs human attention:

**Machine decides** (objective, swept and scored offline): vowel target geometry, formant
accuracy, burst timing and strength, lateral branch dimensions, anti-alias and stability
margins, sheep-band suppression.

**Human decides** (perceptual, settled by tournament): drawl distribution, pitch arc shape,
effort arc, roughness amount, brightness, how the word ends.

Roughly 20 parameters total, of which only 6–8 should ever reach a human.

---

## Success criteria

The ear is final. But these gates must pass on the way, or the ear is being asked to judge
something already known to be broken:

1. Lateral shows an anti-resonance
2. Formant trajectory tracks a real /gɔːl/ within tolerance
3. H1–H2 in the pressed range at peak effort
4. No AM above ~2% in the 4–9 Hz band
5. Spectral tilt in voice range, not buzz range
6. A tuned voice can speak a word it was never tuned on, without retuning

---

## Build-a-voice wizard  ✅ built, with a random walk after it

`wizard.html`, linked from the header. Four questions with options you can hear — how big, how
lively, what the voice is like, how fast — then a name and a seed. Six public-domain passages to
read, long enough to judge a voice by, which a single phrase is not.

After the four questions there is a walk: two mutations of the current voice, keep the one you
prefer, walk again from the winner. That is the tournament, with two differences — the thing
being compared is a voice you already chose rather than an arbitrary point, and nothing asks you
to track which group is mutating. Choosing a different answer to any question abandons the walk,
because the answers no longer describe where it got to.

Widening the range is its own toggle rather than part of the walk. The range parameters get a
much bigger push than the rest when it is on — a walk that only nudges will not cross a gap the
size of the one below — and they are frozen entirely when it is off, because someone who wants a
small quiet voice should be able to have one.

The second question exists because of a measurement. Against a recording of a person reading
the bench phrases:

| | pitch range | loudness range |
|---|---|---|
| the person | **13.3 semitones** | **22.5 dB** |
| the model | **6.7** | **12.8** |

**Half the range on both axes**, and the bottom matches almost exactly — 78 Hz against 79. It is
the top that never arrives. Flat dynamics is what "robotic" means colloquially, so liveliness is
a first-class question rather than a fine adjustment. The `Wild` option reaches 12.3 semitones,
which is close to a person; loudness only reaches 18.8 dB against 22.5, so **something other
than the existing knobs limits the loudness range** and that is worth finding.

## Where the robot sound is  ◐ narrowed

Not the vowels: they land on their own formants to within 0.6% mid-phrase. Not the wide parts of
the tract, which sit 0.25 out of position and cost 0.6% of formant error. **The range is the best
candidate found so far** — half a person's on both axes — and after that the consonants, which a
listening sweep identifies about two in three of.


## Open questions

- **Does a stadium cry even want to be intelligible?** Real ones are half-articulated. Perhaps
  the target is not a clean /gɔːl/ but a controlled collapse of one.
- **Does nasal coupling help?** Shouting often leaks through the velopharyngeal port. Once the
  branch exists in Phase 2, this is a cheap experiment.
- **How much roughness is right?** Real shouting is slightly chaotic. Every attempt so far to
  add irregularity by hand has made it *less* human. Emergent roughness — from a two-mass fold
  model — may be the only honest route, but that is a Phase 5 question.

---

## Per-voice articulation  ✅ built

Postures were **global**: every voice moved its tongue identically and only the tube length
changed. That cannot represent a real speaker. The measured /u/ and /ʊ/ in the reference
recording are *fronted* by around 400 Hz in F2 — a dialect feature, not a tract-length one,
and shared postures have no way to express it.

A voice may now carry its own postures and fall back to the shared ones for anything it does
not override. Fitted against the recording: **mean vowel error 21% with generic postures, 4%
with measured ones.**

**Consonants are still hand-placed**, from articulatory description — "tip to the ridge",
"body to the velum" — then adjusted until the acoustics looked right. They are not fitted to
anyone. That is the next honest gap.

### The estimator that invented a formant

The first fit reported every vowel within 0.5–4%. The postures it produced were wrong. It had
optimised against **LPC**, which for two of the vowels placed F2 around 2500 Hz where the
transfer function has no peak at all — /ɛ/ came out 1620 Hz adrift. Plotting the spectrum
settled it in one look: peaks at 500, 900 and 2950, and nothing between.

Sixth time in this project that a measurement, rather than a piece of reasoning, has been the
thing that was wrong. The rule that keeps holding: **peak-pick the transfer function; do not
trust LPC**, and when two estimators disagree, plot the thing.

---

## Consonants, measured

Consonant postures were the last part of the model with no evidence behind them — described
rather than measured, then adjusted until the acoustics looked plausible. The reference
recording covers all of them, so they were extracted by acoustic signature rather than by
position: a fricative is the frame with the most high-frequency energy relative to low, a
nasal murmur is the frame with the lowest first formant.

**Approximants and nasals fitted cleanly** — /r/ to 1%, /ŋ/ to 0%, /n/ and /j/ and /l/ to 4%.
The measured nasals have first formants at 234–307 Hz where the model had 330–415; a real
murmur is lower than I had it.

**Fricatives took four attempts and a reversal.** The measurements said the whole family was
far too bright: /ʃ/ at 4250 Hz against a real 2188, /f/ at 6050 against 2438, /θ/ at 9800
against 1750. Three structural fixes followed, each from the same observation — that a
sibilant has a front cavity and an obstacle to strike, and a labiodental or dental has
neither:

- the low cut has to **track the sound**, because a fixed 2.8 kHz corner cannot produce a
  fricative that peaks at 2.2 kHz — it removes exactly the band that sound lives in;
- a fricative is **broadband noise with a resonance on top**, not a resonator fed by noise,
  which is why /ʃ/ had no high tail;
- and **no cavity means no resonance claim** — three sections is not a resonator and should
  not be allowed a 7 kHz quarter-wave.

The reversal: I also tilted the source down for cavity-less fricatives, reasoning that slow
channel turbulence must be low-frequency. The recording disagreed — /f/ carries 65% of its
energy above 3 kHz and /ð/ 63%. They are not low, they are **broad**: a low peak with a long
tail. Removed.

Hand-tuning oscillated between 18 and 28 points of error; a systematic fit with **averaged**
measurements reached 6 on the sibilants and 16 on the rest. Averaging matters because a single
render of a noise source varies by a third, so tuning against one measurement is tuning
against the noise.

**Scope.** The first fricative fits were made at the reference speaker's tract length and did
not transfer — installing them globally broke sibilants at other lengths, because a fricative's
peak is set by the cavity in front of the constriction and that cavity scales with the tube.

So the generic inventory was refitted **at its own default length**, against the same recording
with the targets scaled by the tract ratio (peaks scale inversely with length; the
high-frequency *share* is a shape property and carries across unchanged). Mean error in
high-frequency share: **34 points hand-placed, 9 points fitted**, with every level landing in a
sensible band.

Two things made the fit work that did not work by hand. **Seeding from the target geometry** —
`front cavity = c/4f` fixes where the constriction has to sit, and a hill-climb started from
wherever the posture happened to be fell into a 400 Hz minimum for /ʃ/. And **averaging the
measurements**, because one render of a noise source varies by a third.

The last correction came from the recording again: with no front cavity the low-cut corner was
dropping very far and the lows swamped the sound — but a narrow aperture at the lips radiates
highs *better*, not worse, and a real /f/ carries 65% of its energy above 3 kHz.

---

## Phase 7 — pushing the physics

Measured against a real recording, the model is within 5–8 dB below 3 kHz and **10–17 dB
short above 5 kHz**. It is duller than the speaker. That deficit is the sound of missing
physics, and most of it can be named.

Ordered by expected payoff:

### 7a. Source–tract interaction  ✅ built

The glottis is not a fixed boundary. It is a hole whose area changes over every cycle — wide
open at peak flow, sealed at closure — so the reflection coefficient at that end should change
with it. Ours is a constant 0.75. Real folds are also *loaded* by the tract: the pressure wave
returning from above pushes back on them and skews the flow pulse. This is the difference
between a source that plays into a tube and a source that is part of one, and it is the most
likely single cause of the missing high end.

**Built.** The reflection now follows the glottal area, `r = (A1 − Ag)/(A1 + Ag)`: **0.99
when the folds seal, 0.88 at peak flow, 0.68 when they are abducted** for a voiceless sound.
Previously a flat 0.75 — the folds were not being loaded by the tract at all.

Two things fell out of building it. The first attempt derived glottal area from flow alone,
which made it *zero* during voiceless sounds — modelling abducted folds as sealed, the exact
opposite of the truth, and turning the glottis into a mirror. The gate caught it as a broken
sibilant at one tract length. The second is that abduction opens the glottis *wider* than the
phonatory cycle ever does, so the voiceless case needed its own value rather than a scaled one.

And a measurement worth keeping: the model's high-frequency deficit against a real recording
turned out to be **aspiration**, not losses or radiation. Every preset had breath set at
0.02–0.045; real modal phonation leaks considerably more, because the folds never seal
perfectly and there is always turbulence riding on the voice. Raising it closed most of a
10–17 dB gap above 5 kHz.

### 7b. Frequency-dependent losses  ❌ attempted, reverted

One damping constant is applied everywhere. Real losses are not flat: viscous and thermal
boundary-layer losses scale roughly with √f and with the inverse of the radius, and soft walls
absorb low frequencies through compliance. The audible consequence is **formant bandwidth** —
a real F1 is narrow and a real F3 is wide, where ours are all much the same. Flat bandwidths
are a large part of what makes synthetic speech sound like a filter bank.

**Measured first:** our bandwidths run 24–68 Hz with no trend from F1 to F3, against real
values of 50–90 for F1 and 110–180 for F3. So the diagnosis was right — a real F3 is two to
three times wider than a real F1, and ours were all alike.

**Two implementations, both reverted.**

*Per-section one-pole lowpass.* Gives exactly the right tilt — F3/F1 bandwidth ratio went from
0.7× to 1.9× — and loss that grows in narrow sections, which is physically correct. But
forty-four cascaded one-poles carry forty-four lots of group delay. That lengthens the tube:
F1 fell 11%, and every vowel drifted off its target.

*Consolidated at the boundary.* One filter per round trip instead of forty-four, which is
standard waveguide practice and mostly fixes the drift. But one filter is too gentle to reach
realistic bandwidths, and pushing it hard enough (wallK 0.82) brought the delay back —
vowel accuracy collapsed from 11/12 to 4/12, the uniform-tube validation shifted from
500/1500/2500 to 475/1430/2385, and stop releases went to 240% of the vowel.

**The trade, measured:** at the strongest setting that keeps 11 of 12 vowels, the bandwidth
ratio only reaches ~1.3×. The realism gained does not pay for the accuracy lost, so it is out.

**What it would take.** The obstacle is group delay, not the loss model. Doing this properly
means either a delay-compensated loss filter (shorten the delay lines by exactly the filter's
group delay, which varies with frequency and so needs an allpass to do honestly), or moving to
a formulation where losses are applied in a way that does not add delay at all. Both are real
work, and neither is a tuning exercise. Left documented rather than half-done.

### 7c. Finer sections

At 44.1 kHz with two scattering steps per sample the sections are 3.97 mm. A vowel resonance
spans dozens of them; the front cavity that gives /s/ its character spans **six**. Four steps
per sample halves the section length and roughly doubles the cost. This is the one that would
most improve fricatives.

### 7d. Two-mass folds  ✅ built

Replace the prescribed LF waveform with an oscillator: two coupled masses driven by
subglottal pressure. **Built, and selectable** — *Advanced → Vocal folds → oscillator*.

Three things fell out of the physics without being coded:

- **Pitch rises with tension** at an exponent of 0.44 against the spring law's 0.5. A mass on
  a spring, emerging.
- **Pitch also rises with breath pressure**, which is why a shout goes sharp.
- **Stiff folds at low pressure will not start at all.** That is phonation threshold pressure,
  a real and well-documented phenomenon, and nothing in the model mentions it.

**Two failures worth recording.** The first version never oscillated: with the folds held
*apart* at rest, the Bernoulli pressures on the two masses cancel and there is no net force —
it simply sat there. Real folds rest *adducted*, pressed together, so that subglottal pressure
has something to push against. And the second: a symmetric oscillator does **not** produce
jitter. It settles into a perfectly clean limit cycle, 0.00%. I had expected irregularity to
appear on its own and it does not.

**What it actually buys** is better than that. Real jitter comes from the *drive* — neural
firing is not perfectly regular and breath pressure wobbles. Feed the model a 10% wobble in
breath pressure and it returns **jitter 0.21% and shimmer 2.45%**, both in the healthy human
range, at a ratio of 11.8×. One input, correctly distributed across period, amplitude and
waveform shape. With a prescribed waveform you must set jitter and shimmer separately and
*choose* that ratio; here it is a consequence.

### What this will not achieve

It will not sound like a specific person. Sixty years of articulatory synthesis, up to and
including 3D MRI-derived models, has not managed that — while neural synthesis reached
human-indistinguishable a decade ago by learning a mapping and modelling nothing. The
achievable target here is *clearly intelligible, well-articulated speech that reads as a man
with roughly the right tract and pitch*. The value is that every part of it can be explained,
and you can watch it happen.

---

## Phase 8 — the suprasegmental layer  ✅ complete

Phase 4 said prosody was "the shape of the shout over time" and left it at six parameters.
That framing was too small. What is actually missing is everything **above the phoneme**:
duration, stress, accent placement, amplitude envelope. Right now each of those is either a
constant or one global scalar.

Concretely, in `buildWord` every non-stop segment gets weight `1` (approximants `0.34`, the
first vowel `1+drawl*2.6`), every stop gets the same `stopHold`, every vowel gets the same
amplitude, and the F0 contour is one six-point template scaled to word length. The segmental
layer is good enough now that this is what remains audible.

**The diagnosis:** this is a well-built segmental synthesizer with no suprasegmental layer.

### Build order

The order is not the ranking by payoff — it is the ranking by payoff *given what each step
depends on*. 8.0 has no audible effect on its own and three later steps are blocked on it.

| | step | depends on | audible |
|---|---|---|---|
| **8.0** | syllabification and stress marking | — | no |
| **8.1** | duration weights | 8.0 | **large** |
| **8.1b** | make `D` a rate rather than an absolute length | 8.1 | medium |
| **8.2** | stop closure duration, unreleased finals | — | medium |  ✅
| **8.3** | per-segment amplitude | 8.0 | medium |  ✅
| **8.4** | F0: semitones, accent alignment, declination, perturbation | 8.0 | **large** |  ◐
| **8.5** | pause policy | — | medium |
| **8.6** | vowel reduction | 8.0 | medium |
| **8.7** | allophony: flapping, dark /l/, nasal assimilation | 8.0 | medium |
| **8.8** | layered jitter: drift and tremor | — | small |

### 8.0 Syllabification and stress  ✅ built

Maximum-onset syllabification over the phone string, then primary stress from a suffix and
prefix heuristic with a small exception list. Returned as a `stress` array **parallel to
`ph`**, alongside a `syl` breakdown — added to the return value rather than replacing it, so
every existing consumer of `{ph, from}` is untouched.

No sound changes. This step exists so that 8.1, 8.3, 8.4, 8.6 and 8.7 have something to read.

The heuristic is a heuristic and will be wrong: *banana* defaults to initial stress without
its entry in `STRESS_DICT`. A real system carries stress in the lexicon. Extending the
exception list is the cheap fix and the honest one.

### 8.1 Duration weights  ✅ built

The single largest missing cue, and it is a weight table — no DSP.

- **Voiced-coda lengthening.** The vowel in *bad* runs about 1.5× the vowel in *bat*. Verified
  absent: both spell to `b æ [d|t]` and `vw` hands the `æ` an identical share. This is the
  biggest allophonic duration cue in English.
- **Intrinsic length.** Tense `i u ɑ ɔ ɝ` and the diphthongs run 1.4–1.8× lax `ɪ ɛ æ ʌ ʊ`.
- **Final lengthening.** The phrase-final syllable stretches about 1.25×.
- **Polysyllabic shortening.** Syllables shorten as the word lengthens.
- **Stress.** Unstressed syllables run roughly half a stressed one.

Sources: Peterson & Lehiste (1960), JASA 32(6):693-703 for the intrinsic durations; House &
Fairbanks (1953) for the voiced-coda effect. Shipped with a gate check asserting *ratios*, which
survive a change of speaking rate where absolute milliseconds would pin the gate to one `per`.

Two things learned building it.

**The approximants had to be rescaled, not left alone.** Their flat 0.34 was calibrated when a
vowel weighed 1, and a vowel now weighs about 1.5. Left as it was, the /l/ of *goal* silently
lost a third of its length — 204 ms to 134 ms — as pure accounting. It is now held in ratio to
a reference vowel, and the gate watches that share. Whether /l/ *should* be longer or shorter is
a real question and belongs to 8.7, where dark /l/ lives; it is not something a timing step
should decide by accident.

**The VOT check turned out to have been flaky since it was written**, and 8.1 only exposed it.
See the entry under Open faults; the short version is that its voice-bar probe used a window one
pitch period long, so its reference was a coin flip. Fixed separately and first, with the bands
unmoved.

### 8.1b Make `D` a rate rather than an absolute length  ✅ built

`rateFor(chain, D, v)` — one copy, used by the harness, the page and the bench. The pool is now
`wsum × rate` instead of `D − stopTime − glideTime`, so the weights **set** a word's length
instead of dividing a fixed one. Same arithmetic, causality reversed.

    effect                    want    D fixed    8.1b
    coda voicing  bad/bat     1.45     1.17      1.50
    intrinsic     hɔd/hɪd     1.55     1.28      1.56
    polysyllabic  cap/captain 1.20     1.27      1.40

Two of three land on the literature from a model that an hour earlier could not express them at
all. `bad` and `bat` were previously the same length **to the sample** — 610 ms each — because a
single weight over itself is 1 whatever the weight is.

**`per` is unchanged**, so every existing seed still means what it meant. The rate is `per × 0.90`,
and the 0.90 is calibrated rather than chosen: it is the multiplier that best preserves the
current tempo across a seven-phrase corpus. Tempo holds within ±15% on connected speech; the
outliers are correct — *"banana and a tomato"* shortens because it is mostly weak syllables and
*"how now brown cow"* lengthens because it is four heavy diphthongs.

**D still works**, as a stretch on the rate rather than a hard total. So the duration slider and
the goal cry survive, and a word asked to be twice as long is twice as long throughout instead of
having its proportions squeezed to fit. Gated: *goal* stretches 0.64 s to 2.34 s.

### It was much narrower than expected

This was filed as *wide* — "every gate band that measures a whole word moves. Its own branch."
Switching the harness over broke **one** check, and it was not a band: the onset check hardcoded
the times 0.416 s and 1.026 s for two word onsets in *"I love my daughter"*. Under 8.1b a word's
length depends on what is in it, so an absolute offset lands somewhere else. It now finds the
onsets from the segment map.

That is worth recording as a general point: **a check that assumes a timing is a check that
fails the moment the timing becomes a result.** The bands themselves were all fine, because they
measure ratios and shapes rather than absolute durations — which is the discipline this file has
been asking for since Phase 1, paying off in a place nobody was aiming it.

### What it unblocks

The automated fitter, whose literature targets were unreachable by construction; fitting a real
recording's prosody, which is measured across words; and `poly`, `coda`, `vlen`, `fnl` and
`wkdur` becoming tunable against evidence rather than by ear. The polysyllabic ratio overshooting
at 1.40 against 1.20 is the first thing that is now *worth* fitting.

The weights in 8.1 are normalised against their own sum and spent out of `pool`, so they
redistribute a word's duration without changing it. That means an isolated monosyllable cannot
lengthen: *bad* alone has one held segment, and one weight over itself is 1 whatever the weight
is. The effect is real and measured the moment there is something to be long relative to —
inside a polysyllable, or across a phrase — which is where the comparison lives in connected
speech anyway. But *bad* and *bat* spoken alone are still the same length, and they should not be.

The fix is to let the summed weights set the word's length and make `D` a rate. It is not hard;
it is *wide*. The F0 contour is built from `end`, the duration slider changes meaning, and every
gate band that measures a whole word moves. Its own branch.

### 8.2 Stop closure and unreleased finals  ✅ built

`stopHold` was one constant for all six. A voiced closure cannot be held — oral pressure rises
to meet subglottal and the folds stop — so it is short where a voiceless one is not: roughly
50–70 ms against 80–100. Now a multiple of `stopHold` rather than an absolute, so it tracks the
voice's own timing; at the default 75 ms that is 60 against 90. Word length is still exactly
`D`, the same invariant 8.1 holds, so nothing else in the gate moved.

**The claim that "every stop here gets a burst" was wrong, and I wrote it.** Measured before
changing anything: the /d/ of *bæd* releases at 0% of the vowel peak and the /g/ of *bʊldɔg* at
1%, against 184% for the medial /d/. Word-final stops were **already unreleased** — the tract
simply never reopens at word end, so no burst fires. That is the correct English behaviour, but
it was arrived at by accident and nothing was holding it in place. So the work here was not to
build it but to **pin it**, with a paired assertion: final stops silent, medial stop loud. The
medial half matters as much as the final one, since without it the check would still pass if
bursts stopped working altogether.

A side effect worth naming rather than taking credit for: because voiced closures are now
shorter, they leave more of `pool` for the vowel, so *bad* does come out with a slightly longer
vowel than *bat* even in isolation — 757 ms against 727. That is pool arithmetic, not the
coda-voicing rule of 8.1, and it is far short of the 1.5 that rule wants. 8.1b is still the
thing that fixes it properly.

Place of articulation also moves closure duration — labials longest, velars shortest — but the
effect is smaller, the literature less consistent, and nothing in the bench would catch it going
the wrong way. Not done rather than done badly.

### 8.3 Per-segment amplitude  ✅ built

This entry listed two things. **One of them was already done, by the tube.**

*Open vowels are 4–6 dB louder than close ones* — measured, before writing a line of 8.3:

    ɑ 0.0   ɪ -0.7   ɛ -1.0   æ -1.5   ʌ -2.1   o -2.9
    ɔ -3.6   ɝ -3.7   i -4.0   ʊ -4.1   u -5.6

A span of **5.6 dB**, with /ɑ/ loudest and /u/ quietest — the real ordering, in the real range.
Nothing in the code says so. A wide mouth radiates more efficiently than a rounded one, the lip
section carries that, and the intrinsic loudness of a vowel falls out of its shape. Adding the
per-vowel gain table this entry implied would have double-counted geometry the model already
has, in a project whose stated claim is that it contains no such tables. Pinned as a **report**
measurement instead, which is exactly what the report tier is for: it is worth watching and it
is not something to block on.

*Unstressed syllables are quieter* — that one was real. Nothing in the amplitude path had ever
been told which syllable carries the stress, and three syllables of *banana* measured within
0.9 dB of each other. Every keyframe now carries a level, 1 for stressed and 0.65 for not
(−3.7 dB, mid-range of the published 3–6). It rides beside `fr` and `as`, and it applies to the
frication as well as the voicing — an unstressed syllable is quieter because less air is moving,
and the same air makes the hiss, so voicing it alone would make an unstressed /s/ the loudest
thing in the word.

The two effects interact rather than adding, which is correct and worth expecting: *together*
spreads 8.5 dB because its stressed /ɛ/ is intrinsically loud, while *computer* spreads only 2.0
because its stressed /u/ is intrinsically the quietest vowel there is. Real speech does the same.

The default path is unchanged and gated as such: supply no stress — a chain tapped in by hand,
anything that never went through the speller — and every level stays 1.

### 8.4 F0  ◐ 0, 1, 2 and 3 built; 4 blocked

Four changes, smallest first:

0. **One copy first.**  ✅ The contour was built in FOUR places — `index.html` twice, the
   harness and the bench — as the same six lines copied out. That is the mistake this project
   already paid for once, when the harness kept its own near-copy of `buildWord` and the
   comment beside it admitted a gate with a slightly different copy is how you end up testing
   the wrong thing. `buildF0` in `phonemes.js`, and a structural gate assertion that no other
   file grows one back.
1. **Interpolate in semitones, not Hz.**  ✅ It was linear in Hz, so a fall from 200 to 100
   spent half its time above 150 where the ear puts the midpoint at 141. Every fall in every
   voice was the wrong SHAPE — too slow at the top, too fast at the bottom — while still
   hitting all the right endpoints, which is exactly why it never showed up as a wrong note.
   Gated by driving the real processor, since the engine does its own interpolation and that
   was the copy that mattered.
2. **Consonant perturbation.**  ✅ A vowel does not start at its own pitch: after a voiceless
   obstruent it starts high and falls in, after a voiced one it starts low and rises. Hombert,
   Ohala & Ewan (1979). Asymmetric — the voiceless raising is about twice the voiced lowering —
   and gone within ~60 ms, which is why it is microprosody rather than intonation.

   Defined and gated in **semitones, not hertz**: 1.9 st is 28 Hz on the default 250 Hz voice
   and 11 Hz on John's 95, and the published 10–25 Hz is quoted for male voices. In hertz the
   assertion would have been voice-dependent and the effect would have been wrong on half the
   presets. Depth is `pert` in `VOICE_SPEC`.

   This forced a rewrite of how the contour is assembled, and the rewrite is the useful part.
   Accents and perturbation both land on the same vowel — a stressed syllable after a /t/ has a
   raised onset *and* an accent peak, and really does have both — so pushing points onto the
   contour made them fight over the same instant. The contour is now a **baseline plus summed
   offsets in semitones**, sampled where anything changes. Semitones add where hertz would not,
   which is the other reason that is the right space to work in.

   Two bugs from that rewrite, both caught by the gate: the offsets were evaluated on strictly
   open intervals, so nothing was active *at* a ramp's start, which is exactly where
   perturbation lives — it fired on nothing. Closing both ends instead double-counts at an
   accent's peak, where one ramp ends and the next begins. Half-open, `[t0, t1)`.
3. **Accent alignment.**  ✅ Excursions now sit on the stressed syllables rather than at
   `end*0.55`. The old arch is kept as the BASELINE — it is a good goal cry, it was measured
   from one — and accents ride on top of it. They are **multiplicative**, because pitch is:
   three semitones is three semitones wherever the baseline happens to be, which is what stops
   a late accent vanishing into the declination. Only on the NUCLEUS: `stress` marks every
   phone of a stressed syllable, and accenting all of them puts three excursions on one
   syllable and reads as a wobble. Depth is `acc` in `VOICE_SPEC`, default 3 semitones, and
   `acc=0` returns the baseline exactly — gated, because every prosody knob is a bisection tool.

   **Known gap, from the first run:** the speller marks every monosyllable as stressed, so the
   article *a* in "banana and a tomato" takes an accent. Real phrases destress function words.
   That is phrase-level stress and it wants its own step; it is not an accent-placement bug.
4. **Declination and reset.**  ✅ built, with the terminal contour
   Punctuation survives the speller as `brk,` `brk.` `brk?`, so there is a boundary to work at.
   Three things now happen that could not before:

   **The pitch drifts down.** 1.8 semitones a second from the start of each phrase. The baseline
   it rides on is flat until 55% of the utterance and then falls — a good goal cry, and not how
   a sentence behaves. A first attempt at the reset alone measured no effect, correctly: there
   was nothing to reset.

   **It restarts at a boundary**, less completely each time, so a paragraph descends while every
   clause inside it starts fresh. Six words unpunctuated fall 7.0 semitones; the same six with
   two full stops fall 4.0.

   **A question goes up.** `brk?` puts a 5-semitone rise on the last 280 ms. "Is it true?" rises
   1.8 semitones across its final vowel where "is it true" falls 1.6.

   *The original note, kept because it names what was in the way:*  ❌ **blocked, and worth naming why.** The baseline already falls
   across the utterance. What is missing is the *reset* at a phrase boundary — and a phrase
   boundary is punctuation, which the speller deletes: `replace(/[^a-z]/g,'')` on the way in.
   Nothing downstream can tell a comma from a space, so there is no boundary to reset at.

   The same missing information blocks the terminal contour, since a question and a statement
   differ by a mark that never arrives. Punctuation has to survive the speller first, and that
   pairs naturally with **8.5**, which also needs to know which boundaries are real.

The goal-cry template stays as a voice preset. It is a good shout; it is just not a sentence.

### The tract teleported after every diphthong  ✅ fixed

The pop, finally, and it was found by an experiment nobody had thought to run: *"I lovemy
daughter removes the pop in front of the d."*

That is a strange thing for a **spelling** change to do, and the strangeness is the information.
Closing up the space between *love* and *my* changes what precedes the /d/ from `aɪ` — a
diphthong — to a plain `i`. Nothing else about the /d/ moves.

`baseFor` returns a diphthong's **first** posture: /ɑ/ for /aɪ/. That is correct everywhere it
is normally asked. The pause branch asked it for "the previous shape, to hold" — but by then the
tract has finished travelling to the diphthong's **second** target, so holding the first one
threw it 41 units back to where the sound *began*, in **zero time**, with two keyframes sharing
an instant and no interpolation between them.

Measured in "I love my daughter": instantaneous shape jumps of 41.0 at **310 ms and 1283 ms** —
after *I* and after *my*, both /aɪ/, and exactly the two pops reported. The amplitude spikes 3–4×
right there: 1.8e-2 → 2.0e-2 → **5.8e-2** → 1.5e-2 into the closure, against a smooth
1.8 → 2.0 → 2.2 → 2.3 after the fix.

**It explains every symptom.** Why `onset` dulled one pop and not the other — neither was an
onset, and the two happened to respond differently to the timing shifts it caused. Why removing
the inter-word silence changed the character without removing it — the teleport stayed. Why it
varied between plays — whether a glottal pulse lands on the discontinuity is a matter of where
the jitter has put the period.

Gated as an invariant rather than as a band: **two keyframes may share an instant, but they may
not disagree**, because the interpolation has no time to get from one to the other. Verified by
ablation across five phrases — with the old lookup restored it fails on *I love my daughter*
twice and on *hello world* once.

### 8.5a Onset after a pause  ✅ built

Reported as *"a physical pop in I Love My Daughter before the L and D"*, with the guess that it
was trapped air released as the tongue rose to the palate. **Right place, wrong mechanism** —
and the place is what gave it away.

Neither trapped-air path fires there. `charge` needs `cl<0.14` and /l/'s narrowest point is
0.477; and the lateral pocket's three-port junction reduces *exactly* to the two-port one as its
area goes to zero, so connecting it is smooth (checked algebraically, not assumed).

What /l/ and /d/ actually have in common in that phrase is that they are **what "love" and
"daughter" start with**. Every word onset after a pause did this, /m/ in "my" included:

| | silence before | 30 ms later |
|---|---|---|
| pause → /l/ | 3.0e-12 | 1.3e-2 |
| pause → /m/ | 2.8e-14 | 1.4e-2 |
| /l/ → /ʌ/ mid-word | 1.5e-2 | 1.5e-2 |

The engine eases `flow` in at the start of an utterance — but that ramp is keyed on `seqT`, time
since the whole sequence began, so it happens **once** and never after an internal pause. Word
onsets rose from digital silence to full amplitude in about nine milliseconds.

**It is not a sample-level glitch.** The biggest single-sample jump at those onsets is *smaller*
than at a mid-word transition in the same phrase, which nobody hears. The ear is flagging an
abrupt onset after silence, so the thing to fix — and to assert — is a **rise time**.

`onset` in `VOICE_SPEC`, default 35 ms, `off:0` for the old instant behaviour. Gated in both
directions and on the negative case: mid-word transitions must *not* be ramped, since there is
no silence there to ease out of and softening them would smear every consonant in the phrase.

**This does not close 8.5.** A ramp is right whenever a pause is real. The larger point below —
that most word boundaries should carry no silence at all — still stands, and would mean far
fewer onsets needing to be eased in the first place.

### 8.5 Pause policy  ✅ built

Reported after the onset ramp landed: *"tried a wide variety of onset values and the click is
still there. Some values dull the first or second pop but none dull both."*

**That pattern is the whole diagnosis.** One knob cannot dull two events unless they are two
mechanisms — and they were. The /l/ of "love" is a voiced onset and rides the amplitude envelope,
so `onset` reaches it. The /d/ of "daughter" is a **burst**, and the burst is the only excitation
path in the engine not scaled by the envelope at all, so `onset` cannot touch it. Measured: the
/d/ release sits at 4.10e-2 for every value of `onset` from 0 to 0.06.

But scaling the burst by the envelope does not fix it either — tried, measured, reverted. A
60 ms closure gives the ramp time to finish, so `flow` is already 1 by the release. And the
mid-word /t/ in the same phrase releases at **222%** of its vowel against the post-pause /d/'s
114%, so the burst is not anomalously loud. It is simply the first thing after silence.

**Both pops existed only because there was nothing in front of them:**

| | 30 ms before /l/ | 30 ms before /d/ |
|---|---|---|
| a pause at every boundary | 6.2e-12 | 9.5e-12 |
| boundaries closed up | 2.0e-2 | 1.7e-2 |

A word boundary is now a **transition**, not a silence: `wgap`, default 45 ms, during which the
articulators travel and phonation continues. At or above 90 ms it becomes a real pause and is
silenced as before, which `off:0.14` restores exactly.

The old comment on that branch said a gap should make two words *"sound like a phrase rather
than two recordings played back to back"* — and then silenced it anyway. The intent was right
and the implementation contradicted it.

**Check 15 was rewritten, as this file predicted it would have to be.** It asserted that a
boundary is silent *with* movement; half of that was wrong. It now asserts the boundary is
travelled *through* while sounding, and separately that a 200 ms pause still silences — because
the silencing machinery has to survive for when punctuation reaches the speller, which is what
8.4 step 4 is blocked on.

### 8.5 Pause policy — the original note

`isPause` emits `sil:1, vl:1` and a 90–300 ms gap at **every** space. Most word boundaries
inside a phrase carry no silence at all — only continuous articulation. Default the gap to
zero, keep the articulatory glide, and reserve real silence for punctuation. Until then a
phrase will keep sounding like a word list.

Note that check 15 — *a pause is silent, but the tract keeps moving* — asserts the current
behaviour. It will need rewriting to assert the movement without requiring the silence.

### 8.6 Vowel reduction

`WEAK_FIRST` catches prefixes; with 8.0 this becomes general. Reduce unstressed lax vowels in
non-final syllables to `ə`. Deliberately **not** bundled into 8.0: it changes what the speller
emits, check 9 watches the speller, and a step that both adds a channel and changes the
existing one cannot be bisected.

### 8.7 Allophony

Flapping first — `/t d/` to an alveolar tap between vowels when the second is unstressed. Both
*better* and *water* are already in the test vocabulary and both currently come out fully
articulated. Then dark versus light `/l/`: `ART` carries one `/l/`, and a coda `/l/` wants a
much lower `bodyPos`. Then nasal place assimilation.

### 8.8 Layered jitter

`jitT` is one random walk updated at 40 Hz through a one-pole. Real F0 perturbation is layered:
cycle-to-cycle jitter around 0.5%, a slow drift at 0.3–0.5 Hz and 1–2%, and tremor at 4–7 Hz.
Adding drift and tremor to the LF path is a few lines.

On the two-mass path the existing diagnosis holds — the oscillator is symmetric, so it settles
into a limit cycle cleaner than the LF path with jitter applied. The fix is left/right fold
asymmetry of a few percent in mass and stiffness, which produces jitter *through* the physics
rather than on top of it.

---

## The prosody knobs are in the voice  ✅ built

Everything 8.1 to 8.3 introduced was a module constant in `phonemes.js`, which meant the one
part of the model that most needs an ear could not be swept, could not be seeded, and could not
differ between voices. Phase 1's thesis is that the first job is making evaluation cheap; this
is that, applied to a layer which did not exist when Phase 1 was written.

Eight entries appended to `VOICE_SPEC`:

| | | default |
|---|---|---|
| `vlen` | how much intrinsic vowel length varies | 1 |
| `coda` | how strongly a coda lengthens the vowel | 1 |
| `wkdur` | unstressed syllable duration | 0.60 |
| `wklev` | unstressed syllable level | 0.65 |
| `fnl` | final lengthening | 1.25 |
| `poly` | shortening per extra syllable | 0.12 |
| `stopVc` | voiceless/voiced closure ratio | 1.5 |
| `apw` | approximant weight against a reference vowel | 0.34 |

**Scalars over the published tables, not the tables themselves.** Twelve vowel durations as
twelve knobs is a search space nobody can walk, and the question an ear asks is not "what should
/ɔ/ be" but "is the vowel-length effect too strong". So 1 means the measured values and 0 means
the effect is off — which makes each of these a **bisection tool** as well as a tuning knob:
turn one to 0 and that part of Phase 8 is gone, continuously, without touching code.

`stopVc` splits around a mean of 1 rather than scaling one side, so changing the ratio moves the
voiced/voiceless split without moving how much time stops take altogether. Otherwise it would
quietly have been a speaking-rate knob as well.

They arrive at `buildWord` as one `pros` object rather than eight arguments, so 8.4's knobs can
join without touching a call site again — and a voice *is* that object, since every key is in
`VOICE_SPEC`.

Appended rather than inserted, so every seed written before today still loads with the new knobs
at their published values. The seed is now 52 characters.

**Gated on the thing that matters:** passing the defaults is bit-identical to passing nothing.
This exposed the constants, it did not retune them, and if that ever stops being true then every
band tuned before today was tuned against something else. Exact rather than tolerant — the
scaling form was chosen so that unity is exact in floating point, which was checked before it
was relied on.

### When to sweep

Not yet. Perceived stress is carried jointly by duration, level and pitch, and pitch currently
contributes nothing — `eff` is a fixed arch across the utterance that ignores stress entirely.
Dial `wkdur` and `wklev` by ear now and they will be over-dialled, because the ear compensates
for the missing third cue; then 8.4 lands and everything is too much, with no way to tell which
of the three is wrong. Sweep after **8.4's accent-alignment step** specifically — semitone
interpolation and consonant perturbation do not create the confound, accent alignment does.

Note that eight more knobs is a much larger space than the tournament was built for. Fix most,
vary two or three.

---

## What the ear said

A listening pass over the twelve bench phrases, John's voice, defaults. Recorded because the
notes decompose into far fewer causes than complaints, and because "it sounds robotic" is not
actionable until you know which eight phrases said it.

**"Robotic", on eight of twelve.** The dominant note by a wide margin. Two known causes, both
unbuilt: pitch contributes *nothing* to stress — `eff` is a fixed arch across the utterance —
and every articulator comes to a dead stop at every keyframe, because `u*u*(3-2u)` has zero
derivative at both ends. That is 8.4 and Phase 9, in that order, which is where they already sat.

**"payter peeper", "lah-zee".**  ✅ fixed — a list, not a rule. See Open faults.

**The lateral is an approximant, and it should be a contact.**  See below; this turned out to be
the most interesting thing in the notes.

**Pops at word boundaries.**  ✅ FOUND, by ear — every nasal was firing a stop burst.

The description is what found it: *"the pops remind me of a Kalahari bushman more than an
artifact, so maybe they are physical?"* They were. A click is a sealed cavity released under
pressure, and that is exactly what was happening.

/m/ seals the lips, /n/ the ridge, /ŋ/ the velum — **exactly as /b/, /d/ and /g/ do**. The burst
fires on `cl`, the narrowest diameter anywhere in the tract, which cannot tell a nasal from a
stop. Counted at the processor: **eight bursts behind nasals** against eleven at real stops,
across three phrases.

**The file already knew.** A hundred lines above, `sealedFor` checks `nasal<0.15` with the
comment *"pressure only builds if the air has nowhere to go — with the velum open it escapes
through the nose, which is exactly why /m/ can be held forever and /b/ cannot."* The fact was
applied to the voice bar and never to the charge that feeds the burst. Not a missing insight — a
missing second application of one already written down.

A threshold was not enough: the mouth closes before the velum finishes opening, so a hard
`nasal<0.15` still let three of eight through on the approach. Pressure does not vent at a
threshold. The charge now builds at a rate set by how sealed the system is and leaks through an
open nose with a ~20 ms time constant. **0 behind nasals, 11 at real stops**, and the click
check's loudest release falls from 177% of a vowel to 119%.

**Why five metrics missed it.** They were all looking for a *defect*. The burst was not
defective — it was correct synthesis of an event that should not have been occurring, and
nothing that searches for anomalies finds that. The record of what each one actually measured
stays below, because the lesson is about the method and not about this bug:

*Superseded, kept for the method:* five metrics, five wrong answers, and the breath noise was the
fourth of them.

Fixing the breath tilt was right on its own terms — the voice was climbing at +4.4 dB/oct and now
falls at −5.7 — but it is **not what the pops are**. Reported directly: *"brth does nothing for
pops on the John or woman voice."* Turning the knob across its whole range changes nothing
audible, which falsifies the prediction made when that fix shipped.

What each metric actually measured, so none of them is tried a sixth time:

| metric | what it turned out to measure |
|---|---|
| loudest transient (`outlier`) | nothing — it does not move with the complaint at all |
| count of high-derivative runs | high-frequency **energy**, which is the breath tilt |
| Nyquist-band ratio | the same thing again |
| second-difference outliers | **glottal pulses**, verified: their spacing tracks 1/f0 exactly at 70, 90, 110, 140 and 180 Hz |
| `vl`/`sil`/`vAmp`/branch ablations | nothing — all five moved the count by ≤ 7 out of 154 |

The common failure is that every one of them was invented to be *plausible* rather than
validated against a case where the answer was independently known — which is the rule this file
has had since Phase 1 and which none of these followed.

**So stop measuring.** The thing that has worked every time in this project is localisation by
ear followed by ablation, and it has not been tried on this. The questions that would partition
the space are in `lab/TESTING.md`; the four that matter most are whether a *sustained* vowel pops
with no word at all, whether a single word pops or only a phrase, whether it pops in the same
place every time, and whether `Phase 8 off` changes it. Those four answers rule out more than any
metric here has.

*Superseded note, kept:* the earlier claim that this was found and was the breath noise.

The lead recorded here — that `vl` and `sil` are step functions and `vAmp` smooths too fast —
was **wrong**, and so were the three that followed it. Ablated in turn, transient count out of
154: `vl` interpolated 155, `sil` interpolated 154, `vAmp` slowed to 19 ms 161, lateral branch
forced always-on 154, nasal branch always-on 154. Not one of them moved it.

What found it was giving up on hypotheses and looking at where the transients actually were:
20 of 31 inside /l/, median gap 1.0 ms — not the 10–13 ms glottal period, so not pulse edges.
Then at the samples themselves, which visibly **alternate**, sample to sample. Then at the
articulators, which turned out not to matter: a *sustained* /ɑ/ is the worst of the lot at
−5.9 dB, and it is not moving at all.

It was the **unfiltered breath noise**, climbing toward Nyquist — the open fault two entries up,
filed months of work earlier and never connected to this. Sweeping `brth` from 0 to 0.34 moves
the high-frequency energy 22 dB, and at John's 0.19 it is −8 dB. Fixing the tilt fixes the pops,
because they were the same thing.

*Original note, kept:* reported in three phrases. Measured: the loudest transient in each
is only 3-4× the signal's own motion, where a stop burst is 174%. So these are *not* broadband
clicks and the existing click check is right not to fire. The lead is that `vl` and `sil` are
**step functions** — `this.voiceless=(u<0.5?a.vl:b.vl)` flips at the keyframe midpoint rather
than interpolating, and `if(this.silNow) flow=0` is a hard gate. `vAmp` smooths at about 5.7 ms,
which is fast enough to be heard as a click. That would put pops exactly where they were
reported: word boundaries, and either side of /f/ and /s/. Cheap to test, not yet tested.

**/dʒ/ heard as a noisy "sh"**, twice. It is spelled `d`+`ʒ` and nothing binds a stop release to
a following fricative, so no affricate ever forms — two separate sounds in a row.

**/h/ too quiet and the final /oʊ/ of "hello" does not trail off**, twice.

**"world" as "murd", "brown" unintelligible.** Both are liquid clusters. Same family as the
lateral finding, probably the same cause.

**"the m of *mother* is lost, the m of *my* is fine."** Word-initial nasal after a vowel across a
boundary. Suspected to be the same pause handling as the pops — 8.5.

---

## The lateral has no contact  ❌ not started

Observed by ear, from outside the project: *when a person says /l/ their tongue flicks against
the teeth.* It does, and the model has no such thing. Measured, narrowest diameter in the tract:

| | min diameter | position |
|---|---|---|
| /d/ /t/ /n/ | **0.020 — sealed** | 81% of the way to the lips |
| **/l/** | **0.477** | 84% |
| /w/ | 0.430 | 95% |

**The model's /l/ is less constricted than its /w/.** A real /l/ is a *complete* midline closure
at the alveolar ridge — the same place /d/, /t/ and /n/ seal — with the sides of the tongue
lowered so the air escapes laterally. Here the midline stays open at approximant width and the
side branch is a decoration on top of it rather than the only path the air has.

That single fact explains a lot at once. It is why the lateral "slurs"; it is why *world* comes
out as *murd* when its /l/ is wider than its /w/; and it is why there is no flick, because there
is no contact to break. The check that says "the lateral is not a /w/" passes on the static
transfer function with the branch open, and is measuring the branch rather than the articulation.

**What the fix has to be.** The topology, not the numbers. Today's branches are dead-end pockets
that tap in and reflect — right for the pocket that gives /l/ its zero, wrong for the channel
that carries the flow. A lateral wants the main tube SEALED at the tip and a **shunt** that
leaves the tube before the seal and rejoins it after: a branch with two junctions rather than
one. The closed pocket stays, for the zero. Then the release is a genuine seal-and-break, which
is the flick, and it comes free from the same machinery the stops already use.

This also gives dark /l/ somewhere to live (8.7): light and dark differ in the tongue *body*
while both make the same tip contact, which is not expressible while the tip is an approximant.

Not small. It is the first branch topology change since the nasal tract, and the gate band for
the lateral will move because the thing being measured will have changed. Its own branch.

---

## Could a real tract move that way?  ❌ no, and not only for the teleport

The teleport was an infinite velocity — 41 units of tract shape in zero time. But measuring the
rest of it after the fix is not reassuring either. How long each articulator takes to cross its
own range at the model's fastest:

| | model | a real one |
|---|---|---|
| jaw | **29 ms** | 150–200 ms |
| tongue body | 37–38 ms | ~150 ms |
| tongue tip height | **22 ms** | ~100 ms |
| lips | 26 ms | ~120 ms |
| tongue tip position | 210 ms | ✓ |

**Five of six move four to six times faster than muscle can.** Nothing enforces otherwise: the
tract shape is whatever linear interpolation between two keyframes says it is, and a keyframe
list can ask for anything.

### Constraining it — two levels, one built

**A gate on faults, now.** No articulator above 200 range-lengths per second and no tract
reshape above 20 000 units/s — a full sweep in 5 ms, which nothing anatomical approaches. It is
set to catch a *fault* rather than to enforce plausibility, because the model is uniformly too
fast and that is a limitation rather than a bug. Verified by ablation: reintroduce the diphthong
teleport and it fails.

**That check taught something on its first run.** Its first version watched only the six
articulator parameters — and `art` is emitted by `buildWord` and **ignored by the worklet**. So
reintroducing the bug in the *diameter* line left `art` perfectly well behaved and the check
green. Watching a representation the engine does not use is not watching. It now watches both.

That the two representations *can* disagree, because nothing makes them agree, is the sharpest
argument yet for Phase 9.

**A constraint in the engine, later.** That is Phase 9, and this reframes it: not "interpolate
more smoothly" but **"make implausible motion unrepresentable"**. A critically damped
second-order articulator with a per-parameter time constant cannot teleport, cannot exceed its
velocity bound, and gives undershoot and velocity continuity for free — all three of which are
currently either absent or enforced by hand. The plausibility figures above become a consequence
of the model rather than an accident of how long a segment happened to be.

---

## Phase 9 — the articulators have mass  ✅ built and ON

`artT`, a critically damped second-order follower on the tract shape. The keyframes now set a
**target** and the tract moves toward it; `artT=0` tracks exactly, which is the behaviour of
every version before this. Measured on "I love my daughter":

| `artT` | stops seal | peak tract speed | undershoot |
|---|---|---|---|
| 0 | 0.020 ✓ | 1691 /s | 0.00 |
| 0.015 | 0.020 ✓ | 757 /s | 4.31 |
| 0.025 | 0.020 ✓ | 494 /s | 6.67 |
| 0.035 | 0.101 ✓ | 368 /s | 8.55 |
| 0.045 | **0.407 ✗** | 286 /s | 9.94 |

Both properties come out of the one parameter, which is the argument for doing it this way:
**undershoot is not added, it is what remains when a bounded thing is asked to move further than
it can.**

### A tongue aims past the palate

The first version broke every stop. A uniform time constant above ~20 ms left /d/ and /t/
reaching **0.308** where 0.14 is needed, and a closure that is not reached is not a *reduced*
stop — it is a different sound.

Real anatomy does not have this problem because a tongue does not *aim at* the palate. It aims
**past** it and contact stops it. So a closure target is now aimed 0.45 beyond the surface and
the existing clamp does the rest, which pushes the usable range from about 0.02 out to 0.035.
Nothing linguistic is special-cased; the geometry does it.

### Critical gestures are stiffer  ✅ built

Reported after listening: *"we lost some articulation on some consonants but the overall speech
becomes smoother — this feels like a major leap forward."* Which is the measurement in words:
the smoothing and the lost articulation are the same mechanism.

The fix is articulatory phonology's own: **a critical gesture is made with a stiffer spring.** A
constriction you have to hit arrives because more effort goes into it; a vowel target does not
need to. In a mass-spring account that is literally a shorter time constant, and criticality here
is just how narrow the target is — no extra data, and the right shape anyway, since a vowel has
no surface to press against while a sibilant channel is a few millimetres wide.

That alone fixed the closures completely: stops now seal at 0.020 across the whole range up to
`artT=0.05`, where before they gave out at 0.035.

**And one more distinction was needed.** Aiming past the surface has to apply to a *closure* and
not to a tight fricative — narrowness cannot tell them apart. /z/ targets **0.062**, well under
the 0.14 that marks a stop, so it was being aimed past and driven shut: measured at 0.020, silent,
because the jet needs the constriction to stay above 0.030. A fricative is not trying to close.
It is trying to hold a gap a few millimetres wide, which is the harder thing and the reason
sibilants are acquired late. `fric` already says which is which.

| | before | after |
|---|---|---|
| /z/ constriction at `artT=0.025` | 0.020 — silent | **0.062 — frication** |
| stops sealing at `artT=0.035` | 0.101 | 0.020 |
| stops sealing at `artT=0.05` | 0.407 — open | **0.020** |

### Two things had assumed the tract arrives on time  ✅ both fixed

VOT was the last thing failing, and it turned out to be two separate assumptions that only held
because the tract used to arrive exactly when the keyframes said it would.

**Voicing resumed before the seal broke.** `voiceless` steps back to 0 at the keyframe midpoint.
Under inertia the release is late and the flag is not, so voicing leaked out for the ten
milliseconds between them — the engine had already computed the right VOT, the voice simply
started before the burst. A voiceless stop that has charged and not released is still shut and no
air is crossing the folds, so voicing now waits for it. `charge` is zeroed at the burst, which
hands over to `vot` exactly there.

**`sealVl` was latched every sample instead of once.** It records whether the folds were apart
*behind* the closure, and it was being rewritten on every sample the tract was shut — so the
last sample won, and under inertia the release comes after the *next* segment's midpoint has
already handed voicing back. `sealVl` was overwritten with 0 a few milliseconds before the burst
read it, /k/ got **no VOT at all**, and voicing resumed immediately.

That is the very failure the latch was added to prevent — its comment says so — and it did not
survive the release being late. It latches once now, on the way in.

    artT   VOT, voiced / voiceless
    0      b0  d0  g0   vs  p55 t65 k85     unchanged: inert when the tract is exact
    0.025  b20 d10 g15  vs  p75 t85 k105
    0.035  b25 d10 g15  vs  p80 t90 k115

### The gestural score  ✅ exposed

Reported after the smoke test: *"some things got better some worse but net more natural — seems
like we have a physics based approach to dial the consonants now."* That is the right read, and
it was truer than it looked: three of the numbers doing that work were hardcoded.

A gesture in articulatory phonology has a **target, a stiffness and a blending strength**. The
target is the posture, and these are the rest. All four are now in `VOICE_SPEC`, in a `gesture`
group of their own so the tournament can search them together:

| | | default |
|---|---|---|
| `artT` | how much mass the articulators have | 0.025 |
| `artCrit` | how narrow a target must be to count as **critical** — something to hit rather than aim at | 0.6 |
| `artStiff` | how much stiffer the most critical gesture is, as a fraction of the base time constant | 0.22 |
| `artPush` | how far past the surface a closure is aimed | 0.45 |

Each is load-bearing and gated as such, on the sound it exists for:

    defaults              /z/ 0.062   /k/ 0.020   /d/ 0.020
    artStiff = 1          /z/ 0.067   /k/ 0.020   /d/ 0.176   the closure fails
    artCrit  = 0          /z/ 0.067   /k/ 0.151   /d/ 0.505   both closures fail

**`artStiff` is the consonant dial.** Lower is crisper — 0.22 means a full closure is tracked
four and a half times faster than a vowel target. Raise it and consonants soften toward the
vowels around them; drop it and they snap. That is a single number with a physical meaning, not
a mix control.

`artPush` matters less at `artT=0.025` than it looks, because the stiffening alone is enough at
that speed. It is insurance that starts earning its place as `artT` rises — at 0.035 and above it
is what keeps stops sealing at all.

Verified inert at the defaults: the same phrase renders to an identical hash with the knobs at
their values as with the numbers hardcoded. This exposed them, it did not retune them.

### On by default at `artT=0.025`

Gate green, five seeds agree. Peak tract speed drops from 1691 to 706 units/s, undershoot runs
6.5 units, stops seal at 0.020, and every fricative still sounds.

`off:0` restores exact keyframe tracking, which is every version of this engine before now — so
the whole of Phase 9 is one button in the Knobs panel, in both directions.

At `artT=0.025` the gate fails three ways, and they are regressions rather than band drift:

- **/z/ falls silent** — 0% of a vowel. Undershoot widens the constriction past the point where
  the jet forms, and a fricative with no turbulence is not a quieter fricative.
- **a word-final /d/ releases** — the closure drifts open under inertia and trips the burst.
- **VOT collapses to 20–25 ms** on /p t k/, against a floor of 50.

All three are the same finding at one level up: **a fricative's constriction is as constitutive
as a stop's closure.** The "aim past the surface" rule covers targets below 0.14 and a sibilant
sits around 0.3–0.5, so it gets no protection and undershoots into an approximant.

The fix is to know which gestures are *critical* — which is articulatory phonology's own
distinction, and the keyframes already carry `fr` and could carry the rest. That is the next
step and it is not a small one, which is why the machinery is in and the default is 0.

Gated anyway, so it cannot rot while it is off: off must track exactly, on must **both** slow the
tract and produce undershoot — a filter that only slowed it would not be doing the job, and
undershoot without a speed bound would just be a wrong target — and stops must still seal.

---

## The harness

`node lab/check.js` — one command, one verdict, exit 0 means shippable. It drives the
**shipping engine**, extracted straight out of index.html, so it cannot drift from what
actually runs. Eleven checks, each with a band that exists because something once broke that
way: the uniform tube still resonating at c/4L, vowels against Peterson & Barney, stops sealing
at their own place of articulation, the lateral not collapsing into a /w/, nasals producing a
murmur, sibilants shaped rather than broadband, no clicks at releases, silence after a word
ends, every non-stop sound audible, output finite and unclipped, and Rd spanning the phonation
range.

Two rules learned the hard way. **Bands are calibrated against a known-bad build, not guessed** —
the click threshold sits at 220% because a deliberately over-driven burst measures 558% while
the shipping build measures 177%, and an earlier guess of 140% was flagging normal /d/
dynamics. And **the check must exit non-zero**: a gate that prints a failure but lets the
pipeline continue is not a gate, and one did exactly that here.

The harness found a real physics bug on its first run: the voice-bar decay was being applied to
nasals. That decay models pressure building behind a closure, but a nasal's closure has the
nose open, so pressure never builds — which is precisely why /m/ can be held forever and /b/
cannot. It was silencing /n/ and /ŋ/.

**On resolution.** The acoustic timestep is not a free parameter: section length = c × timestep,
so halving the step halves the section. At 44.1 kHz with two scattering steps per sample the
sections are 3.97 mm and articulation is recomputed every sample. For vowels that is ample — a
resonance spans dozens of sections. Where it bites is **sibilants**: the front cavity that gives
/s/ its character is only six sections long, so its resonance is quantised coarsely. Doubling to
four steps per sample would halve the sections and roughly double the CPU. That is the honest
case for finer resolution, and it is about fricatives, not about the model being under-sampled.

---

## What the phrase pass said  (2026-07-26, voice=man)

Twelve phrases, tagged and noted. The recurring words were **too slow**, **slurred**, and
**pop** — five phrases, four phrases and six phrases respectively.

Two of those are addressed by consonant duration, below. The pops are not: they appear on
/h/, /d/, /g/, /l/, /c/ and a vowel, which is too scattered to be one fault and wants its own
pass. Specific sounds reported wrong and still open:

| phrase | heard as |
|---|---|
| world | "rurled" |
| jupiter | "d-thoo-piter" — the affricate, already filed |
| fox | the /ks/ is mangled |
| how / hello | breathy /h/, and it pops |

## The pops are in the gap after a stop  ❌ open, and narrowed

Six of twelve phrases came back with **pop** in a listening pass. Located precisely, and two
hypotheses eliminated.

**Where they are.** In "Peter Piper picks a peck", the loudest sample in the entire phrase —
9.0e-2, louder than any vowel in it — sits in the 45 ms gap between the /k/ and the /s/ of
"picks". That gap is the stop's release. The same gap exists after every stop, and the same
excess appears in it.

That gap is also why "x in fox is mangled" was reported separately: /fɑks/ has the same /ks/,
and both reports are one fault.

**What it is not.**

*Not aspiration.* The keyframes either side of that gap both carry `as=0`. Nothing is being
aspirated into it.

*Not the burst.* Changing the burst gain by a factor of 27 — 2.2 down to 0.08 — moves the peak
in that gap by less than 6 dB and not monotonically. Whatever is loud there is not the release
burst.

*Weakly related to articulator speed.* Dropping `artT` from 0.025 to 0.010 halves it, but 0.05
and 0.10 are no worse than the default, so it is not simply "the tract moves too fast".

**A NEAR MISS WORTH RECORDING.** Before locating it, a measurement showed stop bursts sitting
between 5 dB below and 12 dB above the neighbouring vowels, where real ones sit 15 to 25 dB
below. It correlated well with the listening pass — the phrase whose bursts were 1 dB under its
vowels was the one reported "ok", the one at +12 was "pop and static". A fix was written and
scaled the burst against a running speech level.

The fix did not move the measured peak at all, which is how the correlation was found to be
coincidental. A plausible story, a table that matched the ear, and the wrong cause. It was not
shipped.

**Also eliminated, earlier in the same pass:** a step-to-rms metric that flagged every fricative,
because broadband noise IS large sample-to-sample steps. That is the sixth pop metric in this
project to measure something other than pops.

## It should take as long as it takes  ❌ designed, measured, not built

Phase 9 gave the articulators mass, so when there is not enough time they **undershoot** — the
tongue sets off, gets most of the way, and the next sound starts anyway. That half is right and
it is most of what makes connected speech sound connected.

The other half is missing. A real speaker faced with a hard sequence does not slur through it on
schedule; they **slow down**. The schedule should yield to the muscles. Raised from listening:
*"I'm limited on pacing by the effort to move my muscles into position for the next sound.
Perhaps a target time that can be exceeded as needed for positioning."*

**How far short the tract currently stops**, measured at the middle of each segment, on
diameters that run about 0 to 3:

| phrase | mean miss | worst |
|---|---|---|
| she sells sea shells | 0.24 | /l/ 0.79 |
| hello world | 0.27 | /l/ 0.65 |
| my mother and my brother | 0.50 | /ð/ 1.14 |
| bad bat bed bet | 0.54 | /d/ 0.97 |

**A first attempt**, as an articulator speed limit that widens any transition asking to move
faster than the tract can. It works — worst miss 1.14 → 0.89 for 11% more time — and it was
reverted for two reasons worth keeping.

*It stretches the transitions and not the holds*, so the share of each segment spent AT its
target fell from over half to 42%. Slowing down for a hard sequence should lengthen both; this
made speech proportionally more transit, which is the opposite of arriving.

*And it broke five existing checks*, all of which assert that word length is set by the weight
schedule. They are right to: making duration respond to articulation is an architectural change,
not a knob. Four of them can legitimately null the new knob to isolate what they measure, but
that is four checks bent around one feature, and the fifth is the at-target one above, which is
a real objection rather than an isolation problem.

**Also found and not fixed:** which phrase stretches most does not match which is hard to say.
"Bad bat bed bet" stretched most because it has eight stop closures — genuinely a lot of tongue
travel — while "she sells sea shells" barely moved. Human difficulty in that phrase comes from
precision between *similar* targets, /s/ against /ʃ/, which a distance-based limit cannot see.

## The tempo was half real speech  ✅ fixed for John, ❌ open for the rest

Measured against `lab/ref/john-phrases.m4a`, calling `buildWord` the way the page does — D
recomputed per phrase as `chain.length * per`, with `rate: rateFor(...)`.

**The model ran a mean 1.7 to 2.0 times the speaker's duration on every phrase.** `per` was 130
to 170 ms a sound where connected speech averages 70 to 80. John's is 0.095 now, mean 1.38. The
other voices are deliberately untouched — one voice at a time, and this is the one with a
recording.

**A WRONG DIAGNOSIS IS RECORDED HERE, because it was in this file for a while and someone may
remember it.** An earlier version of this section said the model made every phrase the same
length whatever was in it, with a table showing ratios from 1.19 to 3.26. That came from pinning
`D=2.9`, the stale default in index.html, rather than letting `applyDelivery()` recompute it per
phrase as the app does. With the real D the ratios are 1.58 to 2.55 — uniformly slow, not
length-blind. Three separate measurements this session used a `buildWord` path the app does not
use.


## John's own voice, calibrated  ◐ tempo done, postures open

One voice at a time, and this is the one there is a recording of.

**Tempo.** `per` was 0.13 — 130 ms a sound, where connected speech averages 70 to 80. Against
the recording the model ran a mean 1.7x the speaker's duration on every phrase. Now 0.095, mean
1.38. The other voices are untouched on purpose.

**It cannot go faster yet, and the reason is not the muscles.** Below about 0.095 an unstressed
fricative stops sounding. Traced: the articulator follower reaches 97% of its travel inside a
55 ms /s/, at an effective time constant of 10 ms. It arrives. What it arrives at is too wide.

**Two of the fitted postures are wrong**, and the old tempo had enough margin to hide it:

| | john | generic | |
|---|---|---|---|
| /z/ | 0.246 | 0.125 | **97% too wide — cannot fricate** |
| /θ/ | 0.020 | 0.190 | **sealed — that is a stop, not a fricative** |
| /ð/ | 0.241 | 0.204 | 18% wide |

These came from the fitting run, which optimised against formants. A fricative's channel is not
something formants can see, so nothing constrained it — the same shape of error as fitting the
nasals on F2, and the same fix: the objective has to include what makes the sound.

## The constriction arrives; the rest of the tract does not  ◐ true, and it matters less than it looks

Measured at each segment's midpoint, as distance from that phoneme's own posture, split by
whether a section is a narrow constriction or a wide part of the tract:

| sym | at the constriction | in the wide parts |
|---|---|---|
| /n/ | 0.000 | 0.806 |
| /r/ | 0.135 | 0.731 |
| /ð/ | 0.484 | 1.164 |
| /s/ | 0.000 | 0.073 |

The narrow gestures land and the wide ones do not, because the criticality rule keys stiffness on
how NARROW a target is — right about precision of contact, wrong about precision of shape.
`artCrit` is 2.0 rather than 0.6 now, which brings the wide parts from 0.43 to 0.25.

**BUT THE DIAMETER DISTANCE BADLY OVERSTATES THIS.** 0.43 out of position in the wide parts
sounds like a catastrophe. Measured where it matters — do vowels in a phrase land on the
formants they have in isolation — it was **1.6% of error**, and is 0.6% now. A wide section's
exact width barely moves a resonance.

So the wide parts arriving is worth having and is **not** where the robot sound lives. Vowels
were already landing. Whatever is left is in the transitions, the source, or the consonants —
and it needs measuring before it is guessed at, which is the lesson of the two structural fixes
that failed this session and the two instruments that turned out to be broken.


## The speller could not say a past tense or a plural  ✅ fixed

Found by putting real prose through the wizard and listening. The two commonest inflections in
English were both spelled letter by letter, as though the vowel were pronounced:

| written | was | now |
|---|---|---|
| times | t ɪ m **ɛ s** | t aɪ m **z** |
| travelled | t r æ v ɛ l **ɛ d** | t r æ v ɛ l **d** |
| diverged | d ɪ v ɝ d ʒ **ɛ d** | d ɪ v ɝ d ʒ **d** |

Both endings are governed by the sound BEFORE them, and the vowel appears only where the stem
already ends in the ending's own consonant, because otherwise it is unpronounceable — `-ed` is
/ɪd/ after /t d/, /t/ after a voiceless consonant, /d/ otherwise; `-s` is /ɪz/ after a sibilant,
/s/ after a voiceless consonant, /z/ otherwise.

Split off before the letter rules run and reattached from the stem's last SOUND, which is the
part that matters: "diverged" ends in the letter e and the sound /dʒ/.

**Still wrong, and older than this:** the vowels of those stems. "travelled" wants /ə/ and gets
/ɛ/, "hoped" wants /oʊ/ and gets /o/, "wanted" wants /ɑ/ and gets /ɔ/, "books" wants /ʊ/ and gets
/u/. Unstressed reduction and vowel quality, not inflection.

## Open faults

Things known to be wrong, so they are not rediscovered as surprises.

**The voice sounds hoarse, and the noise LEVEL is not why.**  ✅ fixed on the second attempt Noticed by ear, and it survives
the obvious explanation. Harmonic-to-noise sits at 22.8 dB and every preset is between 12 and
29, which is inside the healthy human band — Praat puts a healthy sustained [a] near 20. So
there is not too much noise. What is wrong is its **colour**. Measured spectral tilt from
4–20 kHz, where real speech falls:

| | measured tilt | real speech |
|---|---|---|
| /ɑ/ | **+4.4 dB/oct** | −12 or steeper |
| /ʃ/ | +7.0 | falls above ~4 kHz |
| /ð/ | +10.8 | falls |
| /h/ | **−5.7** | −6 to −12 ✓ |

Everything rises toward Nyquist except /h/, and a vowel cannot do that. The cluster around
+4 to +7 dB/octave is the signature of a **differentiator**, which is exactly what lip
radiation is (R(z) = 1 − 1/z, +6 dB/oct) — correct physics that requires the source to roll off
to compensate. The breath noise mixed into the glottal source does not roll off. It goes in as
raw white noise:

    let src=(g*0.9 + (Math.random()*2-1)*this.breath*g)*this.vAmp;   // engine, unfiltered

The /h/ path and the stop-aspiration path both put their noise through a two-pole lowpass
first, and /h/ is the one sound on the list with a physically sane tilt. The filtered paths
behave; the unfiltered one does not.

This is one candidate cause for three separate complaints: the hoarseness, the `static` tag the
bench put on six sounds (g z ʃ ð v h), and the /ʃ ʒ h/ that read as hiss at levels where /f/
reads correctly — gain was measured and is not their problem. **The fix was made, shipped as `b1671ae`, and reverted as `ea9a62d`.** It ran the breath noise
through the same two-pole lowpass the other paths use, with the gain compensated by 5.139 — the
reciprocal of the 0.1946 of unit-variance white the filter passes. It broke the bench and made
*goal* render as static with gaps, and it was reverted whole to get back to a known-good build
before diagnosing. So the analysis above still stands and the remedy is still believed correct;
what is not yet known is why *that implementation* of it failed.

**The hypothesis recorded with the revert does not survive reading the code.** It said the new
filter carried per-sample state (`bh1`, `bh`) never reset at word end or sequence restart,
"where every other noise path in the engine is reset at those points". Only one of the three
is. `stopSeq` and the end-of-sequence branch reset `fh1 fh2 fhx fhy` — the frication path — and
nothing else. The /h/ path (`ah1`, `ah`) and the VOT aspiration path (`vh1`, `vh`) carry state
across words exactly as `bh` would have, and neither produces this symptom. That weakens the
hypothesis considerably. It is the fifth time in this project a confident diagnosis has not held
up, which is the reason this file records them.

**A better candidate, measured.** The 5.139 was derived to restore *variance*, and it does:

| | RMS | peak | crest | samples over \|1\| |
|---|---|---|---|---|
| raw white | 0.577 | 1.000 | 1.73 | 0% by construction |
| two-pole, ×5.139 | 0.577 | **2.657** | **4.61** | **8.3%** |

Four million samples each. Variance is not peak. Lowpassing decorrelates nothing and *correlates*
everything — the result is a slower signal, and scaling it back to the same RMS gives it 2.66×
the excursion. The unfiltered term could never leave ±1; the filtered one leaves it 8% of the
time. That product goes into `src` alongside `g*0.9` and the output is hard-clipped at
`Math.max(-1,Math.min(1,yy*0.8))`. Clipping on the loud parts is a good description of "static",
and clipping hard enough to flatten a waveform is a good description of "gaps".

**Done, and neither reported symptom survived measurement.** There is no clipping: peak output
is 0.04 against a ceiling of 1, so the crest-factor theory above — mine — was wrong too. And the
"gap" is the /g/ CLOSURE, which is supposed to be silent: 3.2e-4 unfiltered against 7.3e-5
filtered. The unfiltered noise had been leaking audible hiss through stop closures, and removing
it reads as the sound dropping out. That is the fix working, not failing.

The gain is **1.93**, matched on peak rather than variance, chosen on evidence: both gains pass
the full gate, but harmonic-to-noise goes 22.8 → 24.5 dB at 1.93 against 22.8 → 16.0 at 5.139,
and the presets were calibrated against 22.8. Smaller perturbation to a number other things were
tuned to.

Measured tilt 4–20 kHz after: **/ɑ/ −5.7, /ə/ −6.4, /i/ −4.5, /u/ −3.2 dB/oct**, and −5.3 at
full breath. Gated, and the check verified in both directions — it fails on all four vowels when
the raw white noise is put back.

One thing that check taught: /l/ was in the vowel list and failed at +2.3 dB/oct *with the fix in
place*, because the lateral's closed pocket is a high-Q resonator near 5.5 kHz, squarely inside
the measurement band. Measuring the source's slope through a side branch measures the branch.

**The dental fricatives hiss.** /ð/ in *mother* and *father* comes out as a staticy "sh"
rather than a soft voiced buzz. The measured target is a peak near 500 Hz with the energy
spread; the model puts it higher and noisier. Suspected cause: the aspiration raised across all
voices to fix the harmonic-to-noise problem also lands on the dentals, where there is very
little voicing to mask it. Not yet diagnosed properly.

**`WEAK_FIRST` reduces vowels it should not.** Found while smoke-testing 8.0. The prefix
regex only requires three more letters after the prefix, so it fires on *better* (be+tter),
*belly*, *reddish*, *apple*, *actor* and *angry*, and each of those spells with a schwa where
it should have a full vowel — *better* is `b·ə·t·ɝ` today. The regularity it is missing is
that an unstressed first syllable is **open**: the prefix is followed by a consonant and then
a vowel (a-bout, be-cause, to-gether), whereas two consonants close the syllable and stress it
(at-las, bet-ter, ap-ple). One lookahead, `(?=[^aeiouy][aeiouy])`, fixes all six — it is
already written and in use, as `WEAK_STRESS`, on the stress side where it changes no sounds.
Applying it to `WEAK_FIRST` changes what the speller emits, so it belongs with **8.6**, not in
a step that promises to change nothing. Note the Latin prefixes satisfy the lookahead
unchanged, since they already end in a consonant.

**The VOT check was measuring one pitch period.**  ✅ fixed, kept for the record. Its voice-bar
probe used a 512-sample window — 11.6 ms at 44.1 kHz, about ONE period of John's 95 Hz voice —
so it measured where the glottal pulse fell inside the window rather than how much voice bar
there was. Across a single steady vowel it returns 4.9 to 31, a 6× swing. `ref` was one sample
of that, so the check passed or failed on where the vowel's midpoint happened to land, and it
had done since it was written. Phase 8.1 moved the midpoint 14 ms and it landed on a peak.

The rule in *On flaky checks* covers it exactly, and this is the third time it has been needed —
the first where the random process was not a noise source but the pulse train. Measured ripple
by window length: 512 → 6.2×, 1024 → 1.29×, 1536 → 1.05×, 2048 → 1.05×, 3072 → 1.25× (it rises
again as the window outgrows the steady part of the vowel). Now 1536, and `ref` is the median
over the vowel rather than one instant. **The bands did not move**: recalibrated against the
same VOT-deleted ablation the original used, 35/50 still sits in the empty gap, now with 25 ms
of margin below and 15 above.

**The chain filter will silently break the stress channel.**  ✅ fixed in 8.1 — `index.html:1225` does
`chain=r.ph.filter(x=>known.has(x))` — it drops any phone the tract cannot say. Check 9 exists
to ensure that filter is a no-op in practice, and it currently is. But `stress` is *parallel*
to `ph`, so the first time that filter removes something while 8.1 is live, every syllable
after it is off by one and the symptom will be a duration bug with no obvious cause. **8.1
must filter both arrays in lockstep, or not filter at all.** Written down now because this is
exactly the class of bug that costs a weekend.

**Open stressed syllables take the long vowel, and it is not a rule.**  ✅ handled as a list.
*peter* wants /i/, *piper* /aɪ/, *lazy* /eɪ/ — a stressed syllable with no coda takes the long
vowel, which is the same mapping magic-e encodes. Tested before writing the rule:

    long   peter piper lazy baby table tiger paper later final open robot
    short  city river seven model lemon cabin robin solid second busy many banana

Identical shape, opposite answers, nothing in the letters to separate them. The rule would have
fixed eleven and broken twelve, and the twelve are right today because "short" is what the plain
letter rules already give. So it is a list of thirty. **Both halves are gated** — the short
column is asserted unchanged, so a later attempt at the tempting rule fails loudly.

**Three speller faults the phrase list turned up, all left unfixed on purpose.**

*Regular past tense `-ed`.* "picked" spells to `p·ɪ·k·ɛ·d` where English says /pɪkt/. The rule
is highly regular — /t/ after a voiceless consonant, /d/ after a voiced one, /ɪd/ after /t/ or
/d/ — and it is the same whole-word shape as the final -y and final -e fixes, since "bed",
"red" and "fed" must not take it. The exceptions are a short closed list of adjectives:
*sacred, naked, wicked, learned, aged*. Worth doing; too big to fold into a lexical fix.

*Magic-e before `-le`.* `^le$` maps to /əl/, which is right for *table, little, candle, apple*
— a consonant then the syllabic -le — and wrong for every magic-e word ending the same way:
*smile* spells to `s·m·aɪ·ə·l`, *male* to `m·eɪ·ə·l`, *whale*, *hole*, *rule*, *style* likewise.
Pre-existing, confirmed identical before and after the -y/-e fix. It is not a one-liner: the
rules only ever match a suffix, so by the time `le$` fires the vowel before the /l/ has been
consumed and cannot be seen. The clean fix is to let the magic-e rules consume through the
final `e` instead of looking ahead at it, which changes the shape of the rule table.

*Final `-s` after a vowel.* Now handled after a voiced CONSONANT — dogs, bells, sells, hands —
and deliberately not after a vowel, because there the spelling predicts nothing: *is, his, has,
as, was* are /z/ while *bus, gas, yes, us, plus, thus* are /s/, and the four function words are
in the dictionary instead. Plurals of magic-e words are a second gap in the same place:
"hopes" spells to `h·ɑ·p·ɛ·s`, because the trailing `s` stops the magic-e lookahead matching.

**Two bugs in `index.html`, found on the way to letting a tuned seed come home.**  ✅ both fixed

*`setVoice` was declared twice.* A voicing setter near the top of the script and the preset
switcher near the bottom, both top level, both named the same. The later declaration wins, so
every `setVoice(1)` in the first half was calling the **preset** setter with the number 1,
looking up `VOICES[1]`, and throwing on `V.v`. **Hold and the space bar — two of the four
controls the README documents — raised a TypeError and did nothing else.** A half-finished
rename to `setVoice2` sat two lines above the collision and had never reached its callers.

Nothing caught it because the file parses perfectly and the failure is at call time, in a
handler, in a browser. The gate now refuses any duplicate top-level `function` declaration in
that script, and that assertion was checked by putting the bug back and watching it fail.

*`goCustom()` silently dropped the measured tract.* `voiceArt()` reads postures off the
currently selected preset, and `custom` had none — so nudging any slider while John was selected
swapped his 26 measured postures for the shared ones, and the voice changed character with
nothing on screen to explain why. It matters more now than it did: a seed carries 28 scalars and
`art` is 26 postures of six numbers each, so a voice tuned in the bench and pasted back relies
entirely on the preset to supply them. `custom` now inherits `art` from whatever it was derived
from.

**"Default" meant two different things, in two panels, and both were wrong the same way.**
✅ both fixed. The tournament's Reset jumped to `defaultVoice()` when the search had *started*
from the selected preset. Knobs' "All defaults" did the same: on John it replaced nine
parameters, moving pitch from 88/99/78 Hz to 208/250/190 — over an octave — and the tract from 40
sections to 44. Neither was a reset; both were loading a different voice.

The rule, now applied in both: **"default" means the voice you picked**, not the middle of every
range. The Knobs button names the preset it will restore, so it cannot be misread. Custom has no
preset to go back to and is the one case that legitimately gets the spec defaults.

Found because the second one was reported by ear as *"seems to break all parameters"* — which is
exactly what it looked like from outside, and exactly what it was.

Also fixed alongside: changing the voice in the dropdown while the Knobs tab was open left every
slider showing the previous voice's numbers while the engine played the new one, with nothing on
screen saying they disagreed. The panels share one voice, so a voice change now repaints whatever
is open and resets the tournament's champion to it.

**Consonant postures are fitted from one speaker.** The fricatives were refitted at the default
tract length with the targets scaled, but everything else — stops, nasals, approximants —
carries hand-placed generic postures, with only the measured voice getting fitted ones.

**Stop bursts are still tuned rather than derived.** A release is a pressure transient whose
strength should follow from the pressure built behind the closure and the speed of the opening.
It is currently a level parameter with a place-of-articulation scaling.

**The two-mass oscillator sounds more robotic than the waveform it replaced.** A symmetric
oscillator settles into a limit cycle more perfectly periodic than the LF path with jitter
applied. It is off by default. Making it sound better probably means asymmetry between the two
folds, which real larynges have and this model does not.

**No prosody above the word.** Pitch is an arc across a single word, and a phrase is words with
pauses between them. Real speech has phrase-level contours, stress, and final lengthening.
This is no longer just a known fault — it is Phase 8, with a build order.

---

## Consonant targets and solver  ✅ 7/7 sonorants, ◐ fricatives

`lab/consonant-targets.json` holds the targets, `lab/solve-consonants.js` fits postures to them.

| | |
|---|---|
| /l/ /m/ | were already within tolerance |
| /r/ /w/ /j/ | **solved** — /r/ F3 1610 against /l/'s 2730, a 1120 Hz gap where there was 290 |
| /n/ /ŋ/ | **open** — stage B |
| fricatives, stops | **not started** — they want spectral-peak targets, not formants |

**Stage B starts by fixing the measurement, not by solving.** `BRANCHED` is `{l: 1}`, so
`formants()` opens the lateral pocket and there is no nasal one at all — a nasal is currently
measured as a tube sealed part-way along with no outlet, which is a closed cavity and not a
murmur. Fitting to that would produce confident numbers for the wrong system.

Each target carries anatomical bounds on its own articulators. Three formants underdetermine a
tongue: unbounded, the solver hit every target and reached /w/ with a flat body and a raised tip.

## /ʒ/ is right when sustained and wrong in a word  ✅ solved

It was the balance, not the noise. In a word /ʒ/ had 83% of its energy below 800 Hz and /ð/ had
99% — almost entirely voice with a trace of frication on top. Forcing them voiceless dropped
them to 0% and 1%, which is what showed the noise was always right.

`squeeze` cuts voicing as the tract narrows and did not cut nearly enough for a fricative. A real
one is much quieter than a vowel: the constriction raises the pressure above the folds and the
flow across them nearly stops. `fricDuck` is what that costs, 0.75 by default. /ʒ/ is 37% voice
now.

The sustained measurements that said it was fine were not wrong either — `sustain()` forces
voicing to a fixed level, so it was measuring a case that does not occur in speech.


## Note on method

Four times during the earlier synthesis work, a confident diagnosis turned out to be a
measurement artefact rather than a real defect. The offline scoring in Phase 1 exists partly to
stop that happening again: every metric it reports should be checked against a case where the
answer is independently known before it is trusted to judge anything.
