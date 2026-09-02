# Two questions about controlling a throat

**Status: stages 0, 1 and 2 have been run against mngu0, on 2026-09-01 and 02. Stage 0 failed as
first posed and passed re-posed; the MRI then showed the map to be a vowel instrument; the coils
were registered into the MRI's frame instead, which recovered the consonants; stage 1 there says
target-and-interpolate loses to holding the target; stage 2 says the residual is structured, by
the neighbours crossed with the within-segment clock, and not by prosody. Each is written into its
section below, with the numbers in research/README.md.**

*Stage 0a — making the engine's real trajectory observable — is done: `lab/artspace.js`,
`lab/trajectories.js --actual`, `processorOptions.artOnly`, and two gate checks. It found three
errors in this document, all corrected below and marked where they were. mngu0 arrived on
2026-09-01 (day-1 EMA, alignments, audio, and the same speaker's static and dynamic MRI). Stage 0
was run the same day; what it found is under "Stage 0 — measured" below, and in
[research/README.md](research/README.md) with the numbers.*

**One.** *What is the simplest law that reproduces the movements a brain produces?* How much of
measured human articulator motion does a target-and-interpolate model account for, and what
systematically remains. Descriptive, falsifiable either way, and answerable with a public corpus
and this engine as it stands.

**Two.** *Should physical knowledge constrain a model, or merely inform it?* Whether a vocal
tract is better used as a bottleneck a network must speak through, or as a prior shaping what it
learns. Four arms, cheapest first, and the cheapest one answers the foundational question — does
knowing about throats help a text-driven model at all.

They share stage 0 and nothing else. The first is a few months. The second starts in weeks and
only becomes expensive if its early arms say the expense is warranted.

## The question

Not "build a better controller". That is a goal, not a question, and it has no failure condition.

> **How much of measured human articulator motion is accounted for by a target-and-interpolate
> model driven from the phoneme string alone, and what systematically remains?**

The residual **is** the finding. If it is structured — varying with stress, phrase position, rate,
or which gesture came before — that structure is the missing control principle and it is
describable. If it is unstructured, target-and-interpolate is adequate at the articulator level
and the naturalness gap lives somewhere else, which is also worth knowing and is publishable as a
negative result.

This is answerable, and answering it either way is a contribution. That is the whole reason to
prefer it over "make it sound better".

## What already exists, so we are not pretending the field is empty

**Articulatory Phonology and Task Dynamics** (Browman & Goldstein; Saltzman & Munhall) already
model gestures as critically-damped mass-spring systems with targets, stiffness, and phasing
relations between them. **This engine is already a crude instance of that** — `artT`, `artStiff`,
`artCrit`, `artFar` and `velT` are gestural dynamics parameters arrived at by ear rather than
derived from the theory.

**Optimal control** is the live competitor: trajectories as minimising a cost, typically effort
against acoustic distinctiveness (Elie, Simko & Turk 2023). It explains undershoot and rate
effects without hand-set stiffness.

**What the field says it needs** is control models, explicitly and for a long time: the standard
survey names the generation of articulator movements as the main problem to address, while
considering the acoustics of static sounds largely solved. That has been the stated gap since
2008 and it is still the stated gap, which should be read as a warning about difficulty rather
than as an open door.

So the contribution on offer is not a new framework. It is a **quantitative account of how far
the simplest framework gets**, which as far as I can tell nobody has published at scale, partly
because most articulatory synthesisers are too slow to fit thousands of utterances.

## Why this engine is a reasonable instrument

**It is fast, and the number matters more than the adjective.**

**Corrected, and the original figure was attached to the wrong quantity.** This section used to
read: planning a nine-word utterance takes 2.17 ms, so one pass over mngu0 is 2.8 seconds and a
2,000-evaluation search is 1.6 hours. The 2.17 ms is real and it is the cost of **planning the
targets**. It is not the cost of producing a trajectory, because the trajectory is not in the plan —
see the correction to stage 1 below. `lab/fit-auto.js` had the honest ratio written in it the whole
time: *"a rendered word costs about 4.3 seconds and `buildWord` alone costs 0.24 ms — four orders of
magnitude."*

Measured, voice john, a nine-word utterance:

| | |
|---|---|
| plan the targets (`buildWord`) | **0.55 ms** |
| trace the tract that is actually spoken | **1042 ms** |
| the same, articulation-only, inverted to postures at 200 Hz | **993 ms** |

So the real figures:

- one pass over all of mngu0 (~1,350 utterances): **about 20 minutes**
- a 2,000-evaluation search over the gesture parameters: **about 570 core-hours**

A pass is still cheap enough to run whenever you like. **The search is not**, and pretending
otherwise was the load-bearing error in this section. `processorOptions.artOnly` now runs the
articulation without synthesising anything — bit-identical diameters, gated as such — and it only
bought 1.37x end to end, because once the acoustics are gone the cost is the posture inversion
rather than the engine. The way to afford the search is to stop inverting inside it: register the
measured EMA into articulator coordinates once, forward-map it through `articulate` once, and let
the search compare in diameter space where the engine already lives.

Most articulatory models solve aero-acoustic equations per sample and cannot be fitted at this scale
at all, which is a real part of why the control literature is thin on large fits — and that remains
the strongest argument for using this engine rather than a better one. It is an argument about
minutes against weeks, not seconds against hours.

**It is interpretable.** Six articulator degrees of freedom — `jaw`, `bodyPos`, `bodyHi`,
`tipPos`, `tipHi`, `lip` — and a handful of control parameters with physical meanings. A fitted
value is a claim about speech, not a weight.

**It emits the thing to be compared, but not from where this said it did.** ~~`buildWord` returns a
per-frame articulator track. The comparison to measured data is a comparison of two trajectories,
not an inversion problem.~~ `buildWord` returns two representations — the six articulators and the
diameters `articulate` makes from them — and they agree at the keyframes and nowhere else. The
worklet runs its follower over the **diameters**, per section; the six are smoothstepped with no
mass at all. `ROADMAP.md` line 1623 had already recorded that `art` is emitted and ignored.

It is therefore an inversion problem after all, but a small and well-posed one rather than the
usual one. `lab/artspace.js` reads a tract shape back into the six articulators using the engine's
own forward map: six bounded parameters against forty-four diameters, over-determined, gated on
recovering a planted posture. That is a much easier problem than mapping flesh points onto an area
function, and it is the reason the comparison can still be done in articulator coordinates.

**Two things it turned up immediately, both of which change what stage 1 will find.** With the mass
model off, 20.5% of frames sit in a tract shape no posture reaches; with it on, 64.5%. Transitions
are interpolated in **area** space, and a blend of two `articulate` outputs is not generally an
`articulate` output — so the model passes through shapes no tongue could hold, during exactly the
intervals a control model is about. That is before any corpus is consulted.

**It is calibrated to one speaker and instrumented.** Ninety-odd checks, ablation-verified. When a
fit changes something, it is possible to find out what.

## The data

Public electromagnetic articulography corpora, so the expensive half — collection — is already
done:

| corpus | what it is | the catch |
|---|---|---|
| **mngu0** | one British English speaker, 1,354 utterances, EMA @ 200 Hz + audio, **plus MRI and dental scans of the same speaker** | one speaker; email registration; do not redistribute |
| **SPIRE-EMA** | **38 speakers** reading MOCHA's own 460 sentences, phone-aligned, **CC BY 4.0, no registration** | coordinate conventions undocumented — no head-correction or palate notes anywhere in the release |
| **MOCHA-TIMIT** | two validated speakers, 460 sentences each | coil re-attachments at known file indices, an unexplained velum drift, ~6% transcription error never fixed |
| **USC-TIMIT / rtMRI** | real-time MRI, 10 speakers, EMA for 4 of them; **re-hosted CC BY 4.0 in 2026** | image data; MRI and EMA are separate sessions, so no frame-level correspondence |

**mngu0 is no longer at `mngu0.org`.** That domain lapsed and now serves an unrelated Korean
phonetics blog, and it returns HTTP 200, so a link-checker will not notice. It is distributed from
Korin Richmond's Edinburgh page by email approval.

**Not available, despite being cited as though it were:** the Haskins rate-comparison corpus (HPRC),
whose Box link is dead and which is absent from Yale Dataverse — it is the only public corpus with a
deliberate rate contrast, so it is worth an email rather than a download. XRMB appears to be
unobtainable through any public channel now.

Start with mngu0 because it is the largest single-speaker set and the most used, which makes
results comparable to published work.

**EMA gives 2-D positions of a few flesh points. This engine has a 1-D area function.** Getting
those into the same space is the first real problem and is where a great deal of published effort
goes. It is not a detail to be waved at.

## The plan, in stages that can each kill it

### Stage 0 — can the two coordinate systems be reconciled at all?

Map EMA sensor positions onto the model's six articulator parameters. Fit the mapping on held-out
vowels whose tract shapes are independently known, and check that the model's own postures for
those vowels land where the corpus says the articulators were.

**Kill criterion:** if a static vowel cannot be matched within the corpus's own inter-token
variability, stop. Everything downstream is comparing two things that are not the same thing.

This is the stage most likely to end it, and it should be attempted first for exactly that reason.

#### Stage 0 — measured

**As first posed, it fails, and the failure is the engine's.** `research/fit/register.py` fits the
most rigid registration that deserves the name — each posture parameter an affine function of the
one coil that physically corresponds to it, twelve numbers over eleven vowel means — and tests it
leave-one-vowel-out against the engine's own `ART` table, scored in units of the corpus's per-token
scatter, which is what the kill criterion above asks for. Median miss 1.8 token-SDs; a quarter of
parameter-vowel cells within one SD, half within two. Lip aperture registers. Body position and
height register weakly. Jaw and tongue tip do not register at all.

The reason is visible in the correlations across the eleven vowels: the engine's `jaw` follows the
tongue-tip coil (r 0.60) rather than the jaw coil (−0.41), and its two tip parameters follow the
dorsum and the jaw. **Three of the six posture parameters are acoustic knobs wearing anatomical
names.** The table was solved against Peterson & Barney's formants, the inversion is many-to-one,
and the solver took whichever shape rang right; nothing in the engine needed those parameters to
be the articulators they are called until a corpus asked.

**The targets are also the wrong dialect, by measurable amounts, and the misses fall where the
dialects differ.** The speaker's own vowel formants, measured from the audio, agree with the
engine's targets on F1 to a median 21 Hz — inside the speaker's own token-to-token IQR on every
vowel but THOUGHT. F2 disagrees by the textbook RP–American differences: GOOSE 780 Hz fronter, KIT,
DRESS and TRAP 200–300 Hz more central. A perfect registration would still have shown those.

**So the kill criterion was aimed at the wrong thing.** "Can a static vowel be matched" assumed
the engine's posture for that vowel was a posture. It is a tract shape with the right resonances,
which is a weaker thing, and comparing coils to it compares two things that are not the same
thing — the exact fault this stage exists to catch, caught one level earlier than expected.

**Re-posed without the table.** The coils are measured; the speaker's formants are measured from
the same tokens; the forward map from posture to formants is the engine's and is fixed. The one
unknown is the reading of the coils, so the question becomes: *is there one affine reading of the
six coils — one coil coordinate per parameter, twelve numbers, fixed across vowels — under which the
tube reproduces this speaker's vowel formants?* `research/fit/jointmap.py` solves for that reading
and tests it leave-one-vowel-out, with the held-out vowel's posture read off its coils and its
formants compared with the speaker's in IQR units. If it passes, the map is anatomical by
construction and the speaker's posture table falls out of it. If it fails, six parameters cannot
describe this speaker's articulation, and the plan stops here as designed.

**It passes on the full fit.** With the twelve numbers solved on all twelve vowels the tube
reproduces the speaker's formants to a median 0.45 IQR; 75% of the twenty-four formant cells are
within one IQR and 96% within two. The one miss beyond two is FLEECE's F2, 1650 against 2057 Hz:
the tube cannot make a vowel that front and close from the posture the coils read out, which is a
statement about the body hump's fixed width, and worth keeping. Every slope has the sign and the
size a coil reading should: jaw −0.81 per cm of jaw height, lip +0.94 per cm of aperture, body
position −0.56 per cm of the body coil's front–back position, tip position −0.087 per cm against a
purely geometric −0.057 for a tract this long. The postures it implies are the ones a phonetician
would draw — closed lips and a back body for THOUGHT, FOOT and GOOSE; a dropped jaw for TRAP, STRUT
and PALM — and no parameter is doing another's job, which is what the engine's own table failed.

It also nearly did not pass, and the reason is recorded because it will recur: Nelder–Mead from a
neutral start converged to an objective of 57 with three slopes at zero, and coordinate descent
from there could not move it — a genuine local minimum, not a stall. Started instead from the map
`register.py` had fitted to the engine's table — wrong targets, right physical scale — it reached
23. A twelve-dimensional fit is not to be trusted from one start.

**And it holds out.** Refit twelve times without one vowel, that vowel's posture read off its
coils by a map that never saw it: median 0.45 IQR, 75% of cells within one IQR, 92% within two.
The two beyond are FLEECE's F2 (1530 against 2057) and LOT's F2 (1210 against 1066). **Stage 0
passes its own kill criterion**, with a map fixed as of 2026-09-01 in `research/fit/mngu0_map.json`
and, by the rule stated below under "what could go wrong", not to be refitted. The speaker's
posture table for stage 1 is that map applied to each vowel's mean coil vector, and the engine's
`ART` table is not part of the comparison anywhere downstream.

**What the MRI is now for.** The static volumes hold the same speaker sustaining the same twelve
vowels, airway black against tissue at 1.09 mm. That is the "independently known tract shape" the
stage was written around, and its job has sharpened: not to register the engine's table, but to
check the joint map — the constriction location and degree it implies per vowel can be read off
the image with neither coils nor formants. Not yet done.

**Two things the coils said before any model was consulted, both of which bear on stage 2.**
Token-to-token scatter is 2 to 2.5 mm per coil, the same size as the spread between vowel means:
connected speech barely visits its targets, and a "target" for this speaker is a distribution, not
a point. And undershoot is already in the means — longer tokens sit further out on every vowel — so
the first thing stage 2 will regress is visible in the first table, which is a validation of the
instrument rather than a result, as the closing section of this document warns.

### Stage 1 — how far does target-and-interpolate get?

Drive the model from the phoneme string of each utterance. Fit the control parameters to
minimise trajectory error against the measured articulators. Report **variance explained per
articulator**, held out by utterance.

**A correction, and it was nearly fatal to the whole stage.** This used to say "fit the ten control
parameters", meaning `VOICE_SPEC`'s `gesture` group, against the CSV from `lab/trajectories.js`.
That could not have worked, for two independent reasons.

**Four of the ten cannot move an articulator under any circumstances.** The group is `artT artCrit
artStiff artPush velT fricDuck decl reset ask artFar`. `decl`, `reset` and `ask` are pitch-contour
parameters and `fricDuck` is a level; they are grouped with the gesture knobs because a tournament
mutates them together, not because they are gestural.

**And the remaining six never reach the exported track at all.** `artT`, `artCrit`, `artStiff`,
`artPush`, `artFar` and `velT` appear in `phonemes.js` only as `VOICE_SPEC` declarations, one preset
value and that group listing. `buildWord` never reads them — they belong to the worklet's follower,
which acts on the diameters. So an optimiser pointed at the articulator columns would have reported
**all ten unidentifiable**, and the sensible-looking response to that would have been to distrust
the corpus or the registration rather than the instrument.

Fixed by `lab/trajectories.js --actual`, which traces the running engine and inverts each frame back
to a posture. The parameters are identifiable against that track because it is the one they move.

**What each outcome means:**

- **Above ~90%** — the framework is adequate and the interesting problem is elsewhere. A short,
  useful, deflationary paper. Also the outcome that makes this project a dead end, so it is worth
  wanting to know early.
- **60–85%** — the expected range, and the one worth pursuing. The residual is large enough to
  characterise.
- **Below ~50%** — either the mapping from stage 0 is wrong, or something fundamental is missing.
  Suspect the mapping first.

#### Stage 1 — measured

Run on 2026-09-01, the same day as stage 0, on the corpus's own train/test split: fitted on 120
training utterances, scored on the 61 held-out test utterances, 39,519 frames. Full design and
tables in [research/README.md](research/README.md).

**The model runs on the speaker's clock.** `lab/trajectories.js --seg` feeds the planner the
corpus's phone string with the corpus's segment durations, and `buildWord` takes them as imposed —
so the duration model is out of the question and only the movement between boundaries is tested.
Compared in diameter space, where nothing a posture does is invisible; the posture inversion is
kept for a secondary table and warm-started from the plan, after the previous-frame warm start was
caught random-walking an unidentifiable tip position into an R² of −47.

**Variance explained, held out, vowel frames (all frames):**

| | R² |
|---|---|
| hold the target flat | 0.457 (−0.17) |
| the speaker's per-phone mean posture | 0.482 (0.41) |
| the speaker's per-phone mean given both neighbours | **0.568 (0.51)** |
| target-and-interpolate, engine consonant targets | 0.439 (−0.15) |
| target-and-interpolate, speaker targets, no mass | 0.454 (0.41) |
| target-and-interpolate, speaker targets, defaults | 0.506 (0.43) |
| target-and-interpolate, speaker targets, fitted | **0.530 (0.44)** |

**Three things this says.** With the shared consonant targets the movement law is worth nothing —
it loses to holding the target flat, and the fit on those targets drove mass and glide toward zero.
With the speaker's own targets for every phone it is worth something, and the critically damped
follower is the part that works: 0.506 with it, 0.454 without, 0.530 fitted. And the residual is
structured: a lookup that knows the neighbouring phones reaches 0.568, so about nine points of
variance live between "phone" and "phone in context", and the fitted model recovers half of them.

**What the fit chose is itself a description of the speaker.** `artT` 0.016 against the default
0.025, `artCrit` 0, `artStiff` 0.355, `artFar` 2.3, `glide` 0.037 against a floor of 0.03: less mass, no
gesture singled out as critical, stiffness keyed to distance travelled, and the shortest transition
allowed. He moves faster and more evenly between targets than the engine's defaults do, and what the
follower contributes is the smoothing rather than the lag.

**On this document's own scale this sits on the 50% line**, 53% in the trusted frames and 44%
overall, with the instruction to suspect the mapping first — and two parts of the mapping are
suspect by construction: the stage 0 map is applied frame by frame to consonants it was never fitted
on, and the speaker's consonant targets are its linear extrapolation, which never closes. The
same-speaker MRI is the check on both and is the next thing to do before stage 2 regresses anything.

**One engine finding fell out.** The lips are the one region where the dynamic model loses to the
static table (0.447 against 0.577). Either the lip follower is too slow or the lips are not a
critically damped mass. Filed for the engine, not tuned away.

#### The same-speaker MRI, read

Done on 2026-09-02, the check both stages owed. `research/fit/mri.py` reads each static volume's
midsagittal slice into an airway width along the tract, on a roof found from the images (a trace by
eye had sat on the tongue's mucosa, 11 mm too low — which is why it is found and not drawn). The
roof runs 17.1 cm from the laryngeal vestibule to the upper lip, against the 19.4 cm the F3 median
had implied; the F3 estimate was the one to doubt. Every prompt's overlay was checked by eye: K
closes at the velum, T at the alveolar ridge, SIN narrows to a millimetre at the teeth. A width is
not a diameter, so what is compared is the place of the tightest point, the profile correlation,
and the tightest point against the rest of the tract.

**Stage 0's map is vindicated on the vowels, independently of coils and formants.** Its postures
correlate 0.60 with this speaker's airway profiles where the engine's Peterson & Barney table
correlates −0.02. KIT and DRESS are the exceptions: the map puts their constriction far too far back.

**The engine's consonants are 1.8 to 3.6 cm too far back for /s t l r k/** — /k/ closes at 0.48 of
the tract where the speaker closes at 0.65, uvular rather than velar; his /r/ is an alveolar
approximant where the engine's is a bunched palatal — and about right for labials, dentals and /ŋ/.

**And stage 1's "speaker" consonant targets are geometrically wrong**, which changes how its result
is read. They are the vowel-fitted map extrapolated to consonants; against the MRI they are
anticorrelated (r −0.18) with a median place error of 3.9 cm. So of the gain from 0.439 to 0.506
above, an unknown part is the map agreeing with itself on both sides of the comparison. The fix is
targets from the anatomy: `research/fit/mri_fit.py` solves postures against the MRI profiles as
shapes (median r 0.84, every constriction within a gridline), and stage 1 is re-scored with them
below. They are geometric targets only — no acoustics was asked of them, and a /t/ fitted this way
need not seal — so a voice built on them needs a joint geometric–acoustic solve, which is the next
instrument.

**Re-scored with MRI-fitted consonants, the model gets WORSE: 0.360 against the shared table's
0.439, and −0.74 with every phone MRI-fitted.** Anatomically right targets lose to map-consistent
ones, which says the comparison's measured side — coils read through the vowel-fitted stage 0 map —
is wrong wherever the MRI says the map is wrong, and that a target agreeing with the map's error is
rewarded for it. So stage 1's 0.51–0.53 stands for vowel nuclei under a map the MRI vindicates there,
and its gain over the shared table is inflated by an amount this comparison cannot measure. The
kill criterion's own advice — suspect the mapping first — was right, and the MRI has now said
exactly where: the map is a vowel instrument.

**The retrofit was done and it could not move.** `research/fit/mrimap.py` solves the twelve map
numbers against the MRI profiles of all twenty-four phones, with the vowel formants as a second
term, multi-start and leave-one-phone-out. It returns the stage 0 map almost unchanged, vowels at
r 0.60 and consonants still anticorrelated. The coil means say why: at their midpoints in connected
speech the consonants sit on the vowels — /t/'s tip coil is at −0.33 cm where KIT's is at −0.37,
/k/'s body coil at 0.49 where GOOSE's is at 0.50. The coil is a centimetre behind the tip, contact is
a millimetre inside 2.5 mm of scatter, and a 50 ms consonant is not the shape held for a scanner. No
smooth reading of six flesh points can place a closure, so **the plan's assumption that six coils
would serve the whole inventory was wrong for the consonants**, and that is a fact about the data,
not the model. The question stays answerable for vowel nuclei, which is what stage 1 measured.

**The consonants come back by registration, not by a map.** `research/fit/register_mri.py` puts
the coils into the MRI's frame — the palate found as the upper envelope of 670,000 tongue-coil
positions, a rigid registration onto the MRI roof (11.8°, 2 mm rms), a tongue contour through the
coils with a tip sized so that /t d n/ close at the ridge and vowels do not — and reads the airway
width along the MRI's own gridlines, frame by frame. Over the stretch the coils can vouch for, from
the dorsum coil to the lips, the consonants then land where the MRI has them: median place error
0.4 cm, /t/ at 0.93 against 0.91, /k/ at 0.67 against 0.67, where the affine map had them 3.9 cm
off and anticorrelated. What six coils could not say through any smooth reading they can say as
geometry. The pharynx stays unmeasured. Each frame is then inverted through the tube itself
(`stage1r.py`, per-frame r 0.85), so stage 1 can be scored in the tube's space with a measurement
that sees a closure.

**Scored there, the movement law loses to a step function.** Over the front third of the tract,
all frames, held out: the speaker's own target held flat 0.608; pure interpolation between targets
0.582; the critically damped follower 0.558, and 0.582 once fitted — the fit removes the mass and
stretches the glide, which is interpolation by another name; a per-phone lookup 0.631; a lookup that
knows the neighbours 0.694. Every region loses, the alveolar ridge most. The map-space comparison above had
the follower gaining a few points — but it could not see a consonant and its measurement was the
map's own smooth reading of the coils. Where closures are measured, interpolating in area space
between targets makes the front cavity worse than not moving. That is the answer to this section's
question for the tongue tip and the front cavity: target-and-interpolate, as this engine does it,
is not the law; and the engine's vowel targets in that region have the wrong gradient outright,
narrowing toward the lips where the speaker narrows toward the ridge.

**Stage 1 rerun on the MRI-anchored map** gives the same table shifted up two points — 0.525 at
the defaults, 0.547 refitted (to the same parameters), against 0.503 for the phone lookup and 0.584
for the context lookup — with the same ordering and gaps. So the stage 1 reading stands: over vowel nuclei,
target-and-interpolate given this speaker's own targets recovers about half of the variance that
knowing the neighbouring phones would, and the consonants are outside what the coils can say.

### Stage 2 — is the residual structured?

The actual question. Regress the per-frame residual against everything linguistic that is
available: lexical stress, position in phrase, speaking rate, syllable position, identity of the
neighbouring gesture, distance still to travel.

- **Structured** → that structure is a control principle stated quantitatively, and it can be
  added to the model and tested for whether it improves the fit on held-out data. This is the
  finding worth publishing.
- **Unstructured** → target-and-interpolate is adequate at this level. Publish that; it constrains
  what everyone else should be working on.

#### Stage 2 — measured

Run on 2026-09-02 on the registered-frame residual, three models with the speaker's own targets
(held flat, interpolated, followed), regressed on the corpus's linguistic columns and scored held
out; then a boosted tree on the same variables as the ceiling. `research/fit/stage2.py`; the
tables are in research/README.md.

**Structured.** About 44% of the residual's variance — some 18 points of the total — is predictable
from the phone string and its timing, held out. The linear inventory finds a third of that; the
rest is nonlinear in the same variables.

**By the neighbours crossed with the within-segment clock.** Context alone reaches the ceiling and
dropping the neighbours loses half of it. This is coarticulation with a time course. Interpolation
absorbs part of it and the follower adds structured error of its own, proportional to the distance
to the next target — the lag of a linear second-order system, which the fitted dynamics removed by
removing the mass.

**Not by prosody.** Stress, duration, rate, word and phrase position add under a point. With
durations imposed from the corpus, whatever stress does to the front cavity it has already done
through the durations.

**A floor.** 56% of the residual, about 22 points of the total, is predictable from nothing in the
phone string, its timing or its prosody, by a model free to be nonlinear. That is this speaker's
token-to-token variation as this measurement sees it, and the ceiling on any phone-driven law.

So the control principle this stage was written to find is describable: the shape at a moment
depends on the current target, both neighbours, and the time within the segment, nonlinearly —
and a blend of two targets in area space is the wrong function of those four things, worse than
holding still.

### Stage 2.5 — does any of it sound better?

**Added, because stages 1 to 3 as written contain no ear at all**, in a project whose own record
says every real diagnosis came from someone listening and not one came from the measurements. Take
the parameters fitted to human trajectories, render the bench phrases, and listen. If trajectories
measurably closer to a person's do not sound more like a person, that is the most interesting result
available here and nobody else is positioned to find it.

### Stage 3 — does it generalise?

Refit on a second corpus without re-tuning. **SPIRE-EMA rather than MOCHA-TIMIT**: 38 speakers
against two, reading MOCHA's own 460 sentences so the comparison is clean, CC BY 4.0 with no
registration, and without MOCHA's documented coil re-attachments and 6% transcription error rate.
The one thing MOCHA still has that SPIRE does not is a velum coil.

Anything that survives a different speaker and a different sensor convention is a claim about
speech. Anything that does not is a claim about one person, which is worth saying plainly rather
than quietly — and with 38 speakers that stops being a standing caveat and becomes a measurement.

## The second question: constrain the representation, or merely inform it?

**Should physical knowledge of the vocal tract be a bottleneck a model must speak through, or a
prior that shapes what it learns?**

### A correction to the earlier version of this section

The first draft said the comparison "articulatory bottleneck versus unconstrained spectrogram" was
already settled, and used it as a calibration baseline both other arms should beat. **That was
wrong, and the error is worth keeping written down because it would have sent the project down
the expensive path for the wrong reason.**

What the literature settles is **biosignal to speech**. Anumanchipalli and colleagues got reliable
synthesis from 25 minutes of data by decoding articulatory kinematics first, outperforming direct
acoustic decoding — but the input there is neural activity. SPARC does acoustic-to-articulatory
inversion. Wu et al. work from MRI and EMG. In every one of those the input is ALREADY
articulatory in character, so routing through articulation is nearly free and of course it helps.

**Text is not.** Text has no articulatory content at all, and whether routing a symbolic input
through articulation helps is a different question with a different answer. Searching the TTS
intermediate-representation literature turns up mel spectrograms, codec tokens, self-supervised
features and VAE latents. Articulation does not appear.

That absence is not evidence it fails. The likely reason is stated plainly in the field: there is
much less articulatory data than other kinds of language data, and current articulatory
synthesisers produce lower-fidelity speech than non-articulatory ones. **A data problem, not a
demonstrated defeat.**

### Which is what makes the soft version interesting

A hard bottleneck can only learn from utterances that have measured articulation — about 1,300,
one speaker. That is the binding constraint on the whole idea, and it is not a constraint about
speech, it is a constraint about corpora.

An inductive prior does not have that problem. Give a net real capacity and shape its INTERNAL
representation toward articulation: an auxiliary loss requiring the hidden state to predict where
the articulators were, or a latent regularised toward articulatory consistency. Train on all the
text and audio available; apply the articulatory loss only on the subset that has EMA.

**The physical knowledge becomes a regulariser rather than a gate.** The corpus stops needing to
be large and starts needing only to be representative — which is a much weaker requirement, and
one a 1,300-utterance set can plausibly meet.

### The four arms

Same encoder, same parameter budget, same optimiser, same schedule. Only what sits between text
and audio differs.

| arm | between text and audio | trains on |
|---|---|---|
| **A** | six articulator parameters → **the tube** | EMA subset only |
| **B** | six articulator parameters → DDSP vocoder | EMA subset only |
| **C** | free latent, **auxiliary articulatory loss** | everything; the loss on the EMA subset |
| **D** | mel spectrogram, unconstrained | everything |

**B against C is the question**: should the physics constrain the representation, or inform it?
Hard priors usually win when data is plentiful and the prior is exactly right; soft priors win
when data is scarce or the prior is approximate. Both conditions here point at C — which is a
prediction, and therefore falsifiable.

**A against B** asks whether true wave physics buys anything over a representation merely shaped
like articulation. It is the more novel comparison and the more expensive one; nobody in the
literature backpropagates through a waveguide, and the two papers that drive a physical model at
all both work around its non-differentiability rather than solving it.

**D is the honest baseline**, and unlike the earlier draft it is NOT assumed to lose. If D wins
outright at matched data, the answer to this whole section is that articulation is the wrong
intermediate for text input, and that is a real and publishable finding.

### Order of work

**C against D first.** It needs no differentiable tube, no rewrite, and it answers the
foundational question — does physical knowledge help a text-driven model at all, in the cheapest
form it can take. Weeks.

**Then B against C**, which needs only the DDSP vocoder, already published and reimplementable.

**A last, and only if the earlier arms justify it.** A differentiable Kelly–Lochbaum tube is a few
hundred lines of PyTorch and a real project. If articulation shows no advantage in its cheap
forms, simulating the physics exactly is unlikely to rescue it.

### What I have not checked

~~Whether articulatory features as an AUXILIARY objective have been tried for text-to-speech. They
are established in speech recognition — the dysarthric-speech literature uses exactly this — but
recognition and synthesis are different problems and the result may not transfer.~~

**Checked, and both halves need correcting.**

**Arm C is not new.** Cao et al. (Interspeech 2017) tried articulatory multi-task learning in TTS,
and it helped. Pre-Tacotron, so the modern re-test and the partial-supervision regime are both
genuinely open — but this is a revisit, not a first, and it should be described as one.

**The dysarthric-ASR claim is withdrawn.** That literature is input fusion essentially without
exception, not auxiliary loss. What is established is articulatory *attributes* as an auxiliary task
(Bell & Renals, Interspeech 2015; Lee et al., APSIPA 2019). Continuous *kinematics* as an auxiliary
loss rests on a single unrefereed preprint.

**And the shuffled control turns out to be the strongest thing in this section.** Bell & Renals
asked precisely this question in 2015 — whether the gain comes from the linguistic content or merely
from a low-dimensional secondary task reducing noise — and never closed it. Their 2017 follow-up
varied target *cardinality* while holding the phonetic question set fixed, which isolates the wrong
variable, and concluded the benefit was probably just diversity among arbitrary targets. Meanwhile
MAXL (NeurIPS 2019) shows a randomly generated auxiliary hierarchy gives a **non-zero** gain in
vision. So the shuffle is not a robustness check on arm C. It is the experiment, it answers a
question the field's own foundational paper raised and abandoned, and the effect it has to subtract
off is known to be non-zero.

## What could go wrong, stated in advance

**The mapping absorbs the finding.** With enough freedom in stage 0, the sensor-to-tract mapping
can fit away exactly the structure stage 2 is looking for. The mapping must be fixed before stage
1 and never refitted afterwards. This is the single most likely way to produce a confident wrong
answer, and it is the failure mode of most analysis-by-synthesis work.

**Speech inversion is ill-posed.** Many tract shapes give the same spectrum. A model that
reproduces the audio may get the articulation wrong and vice versa. Both must be reported, and
where they disagree that disagreement is data rather than an embarrassment.

**One speaker is one speaker.** Everything found in stages 1 and 2 is provisional until stage 3.

**The phoneme string is not the input a brain gets.** Segments are a linguist's abstraction. If
the residual turns out to be largely about where segment boundaries were assumed to be, the
finding is about the annotation rather than about control.

**The auxiliary loss may be doing something other than what it says.** An articulatory objective
on a free latent could improve things by acting as any regulariser would — extra supervision,
noise, a smoother loss surface — rather than because the information is about throats. The control
that separates those: the same auxiliary loss against a SHUFFLED articulatory target, which
carries the same shape and statistics and none of the meaning. If shuffled targets help nearly as
much, the physics is not what is helping.

**The physics arm may simply be worse.** A waveguide is a strong constraint and strong constraints
cost expressiveness. If arm A loses to arm B outright, that is a real answer — physical realism is
not automatically a better prior than a well-chosen statistical one — and it should be reported as
one rather than tuned away.

**Arm A and arm B must be matched on everything but the bottleneck.** Same encoder, same
parameter count, same optimiser, same schedule. A difference in any of those makes the comparison
meaningless, and it is the easiest thing in the world to get wrong by accident when one arm needs
a rewrite and the other does not.

**Known effects will be rediscovered.** Undershoot, coarticulation, phrase-final lengthening and
the utterance-length law are all documented. Rediscovering them is a validation that the method
works, not a result — and the temptation to present them as results should be resisted.

## Feasibility

**Stage 0 alone is a few weeks** and decides whether the rest is possible.

**The second question is a separate project from stages 1 to 3**, sharing only stage 0's mapping,
and it is staged so the cheap arms come first. C against D needs no tube and no rewrite: weeks.
B against C needs a DDSP vocoder, already published: weeks more. A needs a differentiable
Kelly-Lochbaum tube and is months — and should only be built if the earlier arms say it is
warranted.

**Stages 0–2 on one corpus is a few months of focused work** and a workshop paper if the residual
is structured, or a short negative-result note if it is not. That is a real and achievable
contribution.

**Stage 3 and a control model that generalises across speakers and rates is the thing the field
has been asking for since 2008.** It is unsolved because it is hard, not because nobody tried. It
should not be the plan; it should be the thing the plan might earn a look at.

## Running it

**On your machine, not a cloud VM.** One pass over mngu0 is about twenty minutes and the parameter
search is around 570 core-hours as it currently stands — a desktop parallelises the pass to a couple
of minutes and does not rescue the search, which needs the restructuring described above rather than
more cores. And the corpora
carry licences: mngu0 and MOCHA both require agreeing to terms before download, and putting the
data on third-party infrastructure may breach them. Local avoids the question.

**Node for the trajectories, Python for the fitting.** `lab/trajectories.js` emits the model's
articulator track as CSV; Python does the regression and the plots.

Not a Python port of the engine. A second implementation drifts from the first — which is the
exact fault this project spent a week removing, three times over — and it carries the extra hazard
that the model being fitted is not the model anyone has listened to. The trajectory generator has
to be the engine itself.

    node lab/trajectories.js --in utterances.txt --out tracks.csv --voice john --rate 200 --actual

One utterance a line, optionally `id<TAB>text` so the corpus's own identifiers come through.

**`--actual` is not optional for this project**, whatever the flag name suggests. Without it the CSV
carries the planned articulator track — the one the mouth view draws, which no control parameter can
move. With it, the runner traces the engine and inverts each frame back to a posture, and adds
`act_*` columns plus `inv_rms` and `clamped`. Those last two are not decoration: `articulate` floors
every section at 0.02, so a stop closure genuinely does not determine the tongue behind it, and a
residual regressed against a high-`clamped` frame is a residual regressed against a guess. Drop them
or say so.

It still renders no audio — `processorOptions.artOnly` runs the articulation and stops, gated as
producing bit-identical diameters and silence.

**What comes back matters more than how it is run.** Not audio and not the corpus — the
**per-frame residuals**, measured minus modelled, per articulator, joined to the linguistic
columns the runner already emits: segment, position within it, stress, position in word, position
in utterance, segment duration, utterance length. Tens of megabytes of CSV, and everything stage 2
needs. Fitted parameters and a variance-explained number alone would make the interesting half
impossible.

## What I can and cannot do here

**Can:** write and run the fitting, do the statistics, build the instrumentation, argue about
method, and be the person who says the measurement is wrong — which on this project has been most
of my useful contribution.

**Cannot:** listen to anything. Every judgement of whether output sounds right has come from you,
and several of my confident measurements have been artefacts that only stopped when something
audible disagreed. Also cannot register for a corpus, run a job for days, or be accountable for a
claim in a paper.

**The honest division:** I am good at the part where something is measured and the measurement is
checked. The part where a human ear says "that is wrong, and here is when it happens" has been
the source of nearly every real finding in this project, and it would be the source in this one.
