# research

The fitting side of [RESEARCH.md](../RESEARCH.md). Node makes trajectories; Python does statistics
on them.

Nothing here models speech. `lab/trajectories.js` drives the same `buildWord` and the same worklet
the browser loads, and this reads its CSV; `lab/posture.js` exposes the engine's own `articulate`
and the tract's transfer function over stdin and stdout so postures can be pushed through the
forward map without a second implementation. A Python port of the engine would drift from the
original and would carry the extra hazard that the thing being fitted is not the thing anyone has
listened to — `lab/README.md` records that fault being removed three times over.

## Setting it up

    python -m venv research/.venv
    research/.venv/Scripts/python -m pip install -r research/requirements.txt   # Windows
    research/.venv/bin/python     -m pip install -r research/requirements.txt   # everything else

Node needs nothing: `lab/` has no dependencies beyond the standard library.

    cd research
    .venv/Scripts/python -m pytest -m "not slow"     # seconds
    .venv/Scripts/python -m pytest                   # includes the recovery run, ~20 s

**A venv is not portable.** `pyvenv.cfg` records the absolute path of the interpreter that made it,
so one created on another machine, or by another user, fails with *did not find executable at
C:\Users\<someone-else>\...*. Delete it and make a new one. On a machine with only the Microsoft
Store stub, `winget install Python.Python.3.13` gives a real interpreter; every pin in
`requirements.txt` resolves on 3.13 as well as 3.14.

**Do not let pip resolve pandas freely.** It picks 3.0.5 on Python 3.14, whose compiled extension is
blocked by Windows Application Control — *"DLL load failed while importing properties: An
Application Control policy has blocked this file"* — while numpy, scipy and matplotlib of the same
vintage load fine. The wheel is new enough to have no reputation with Smart App Control and the
block is silent until import. `requirements.txt` pins 2.3.3, which loads.

## What is here

| | |
|---|---|
| `fit/tracks.py` | run `lab/trajectories.js`, read the CSV, compare two runs |
| `fit/recover.py` | plant a parameter, hide it, search for it again |
| `fit/identify.py` | which control parameters are readable from a trajectory at all |
| `fit/mngu0.py` | read the corpus: EST trackfiles, alignments, one row per phone token |
| `fit/formants.py` | the speaker's own vowel formants, from the audio at token midpoints |
| `fit/register.py` | stage 0 as first posed: read the engine's posture table off the coils. **Fails**, and says why |
| `fit/jointmap.py` | stage 0 as it should be posed: one reading of the coils under which the tube makes this speaker's vowels |
| `tests/` | the above, run against the real engine; the corpus tests skip where the data is absent |
| `data/` | corpora go here. Gitignored, and see [data/README.md](data/README.md) for the layout and the coordinate convention |
| `out/` | everything derived: the token table, formant tables, fit reports. Gitignored |

## The corpora do not go in the repository

`data/` is gitignored. mngu0 is distributed on the condition that it is not passed on and MOCHA's
licence is non-commercial, so nothing measured is committed — only what was fitted from it. That is
the same split `lab/RECORDING.md` already applies to the reference recording.

mngu0 is **not** at `mngu0.org`. That domain lapsed and now serves an unrelated Korean phonetics
blog, and it returns HTTP 200, so a link-checker will not flag it. It is distributed from Korin
Richmond's Edinburgh page by email approval.

## Stage 0, measured

The corpus arrived on 2026-09-01. Everything below is one speaker, mngu0 s1, day 1: 1,354
utterances, 52,567 phone tokens, six coils at 200 Hz.

### The coils, before any model is consulted

Per-vowel means and standard deviations of the twelve midsagittal coordinates, over every token of
the twelve monophthongs (`python -m fit.register` prints them). Two facts that shape everything
after:

- **Token-to-token scatter is 2 to 2.5 mm per coil**, and the spread *between* vowel means is the
  same size: the between/within ratio is 1.6 for tongue-body height, the best separator, and below 1
  for every front–back coordinate and for the lips. Connected speech barely visits its targets.
- **Undershoot is already visible in the means.** Tokens longer than the vowel's median duration
  sit further from the centre of the space than shorter ones, on every vowel — STRUT's body coil is
  1.2 mm lower in long tokens than short. That is the structure stage 2 is about, and it is in the
  first table.

### Reading the engine's posture table off the coils does not work

`fit/register.py` fits the most rigid map that could be called a registration: each of the six
posture parameters an affine function of ONE coil coordinate, chosen by what the parameter is
(jaw from the jaw coil's height, tongue-body position and height from the body coil, tip from the
tip coil, lip from lip aperture), twelve numbers over eleven vowel means, tested leave-one-vowel-out
against the engine's own `ART` table and scored in units of the per-token scatter — the kill
criterion's own yardstick.

    median miss 1.8 token-SDs; 24% of parameter-vowel cells within one SD, 53% within two
    lip aperture registers (R² 0.64–0.73); body position and height weakly (0.16–0.34);
    jaw 0.17; tongue tip 0.02–0.05, i.e. not at all

**The failure is on the engine's side, and it is diagnosable.** Across the eleven vowels the
engine's `jaw` correlates with the tongue-tip coil (r = 0.60) more than with the jaw coil
(r = −0.41); its `tipPos` and `tipHi` correlate with the dorsum and the jaw, not the tip. Three of
the six parameters are acoustic knobs wearing anatomical names: the posture table was solved
against Peterson & Barney's formants, the inversion is many-to-one, and the solver took whichever
shape rang right. Nothing in the engine ever needed those parameters to be the articulators they
are called, until now.

**The targets are also the wrong dialect, by measurable amounts.** `fit/formants.py` measures the
speaker's own vowels from the audio (LPC roots, medians over up to 400 tokens of at least 80 ms,
cross-checked against envelope peaks to within 19 Hz). Against the engine's American targets, F1
agrees to a median 21 Hz — inside the speaker's own IQR on all but THOUGHT, where the engine's /ɔ/
is 180 Hz too open. F2 disagrees by the textbook RP–American differences: GOOSE 780 Hz fronter,
KIT 290 Hz, DRESS 255 and TRAP 195 more central. So even a perfect registration would have shown
those vowels missing, and the misses it did show fall where the dialects differ.

### The right question, and the instrument for it

The engine's posture table was the wrong thing to register against, so `fit/jointmap.py` removes it
from the problem. The coils are measured; the speaker's formants are measured from the same tokens;
the forward map from posture to formants is the engine's. The one unknown is the reading of the
coils, and the question becomes:

> Is there one affine reading of the six coils — one coil coordinate per parameter, twelve numbers,
> fixed across vowels — under which the tube reproduces this speaker's vowel formants?

Solved by Nelder–Mead over the twelve numbers with the eleven postures pushed through the transfer
function each step (about 0.5 s an evaluation), then leave-one-vowel-out with the held-out vowel's
posture read off its coils and its formants compared with the speaker's in IQR units. The
speaker-specific posture table falls out as a by-product, and the map is anatomical by construction.

**On the full fit it passes.** Median |z| 0.45 IQR over the twenty-four formant cells; 75% within
one IQR, 96% within two. The one cell beyond two is FLEECE's F2 (1650 against 2057 Hz). The map:

    param    from     intercept  slope/cm       what the sign and size say
    jaw      JAW_y       -1.764    -0.809       jaw lower -> more open; same scale register.py found
    bodyPos  T2_x         2.800    -0.561       body coil further back -> constriction further back
    bodyHi   T2_y         0.508     0.465       body coil higher -> narrower
    tipPos   T1_x         1.015    -0.087       geometric expectation for a 17.5 cm tract is -0.057
    tipHi    T1_y         0.175     0.155
    lip      lipap       -1.834     0.943       wider aperture -> more open

and the postures it reads off the vowel means are the ones a phonetician would draw: lip 0.29–0.36
and body position 0.42–0.54 for THOUGHT, FOOT and GOOSE; jaw 0.70–0.76 for TRAP, STRUT and PALM
against 0.44–0.50 for the close vowels. No parameter is doing another's job. Saved as
`fit/mngu0_map.json`, with the postures, the coil means and the fit report inside it.

**Optimiser note, because it will recur.** Nelder–Mead from a neutral start (slopes at zero)
converged to an objective of 57 with jaw, body position and lip left constant, and every back
rounded vowel's F2 several hundred hertz high. Coordinate descent from there moved nothing: a real
local minimum. Started from the map `register.py` had fitted to the engine's table — wrong targets,
right physical scale — the same optimiser reached 23. `jointmap.py` now runs three starts and takes
the best; a twelve-dimensional fit is not to be believed from one.

**Held out it holds.** The map fitted without a vowel, that vowel's posture read off its coils, its
formants against the speaker's:

    held-out: median |z| 0.45; within 1 IQR 75%, within 2 IQR 92%
    beyond 2: FLEECE F2 1530 vs 2057 (z -3.7), LOT F2 1210 vs 1066 (z +2.4)

**Stage 0 passes its own kill criterion.** The map is fixed as of 2026-09-01 and is not to be
refitted (RESEARCH.md, "the mapping absorbs the finding"). What it settles for stage 1: the target
posture for each of this speaker's vowels is the map applied to that vowel's mean coil vector, not
the engine's `ART` entry; and the trajectory comparison happens in posture space via the same map
applied frame by frame, which `fit/mngu0.py` already produces per token and can produce per frame.

Two things it does not settle. FLEECE cannot be made front and close enough by this tube from any
posture the coils read out, which bounds what stage 1 can explain for /i/ before it starts. And the
map has been checked against acoustics only; the same-speaker MRI is the independent geometric check
and has not been done.

### What the same-speaker MRI is for

The static MRI package holds one sagittal volume per sustained prompt for the same speaker — the
twelve vowels in /hVt/ frames among them — at 1.09 mm in-plane, 4 mm slices. The midsagittal slice
shows the airway black against tissue from lips to larynx. That is the *independently known tract
shape* stage 0 was written around, and it is the check on any map fitted from coils and formants:
the constriction location and degree it implies for each vowel can be read off the image without
either. Not yet done; `pydicom` is in the venv for it.

## Stage 1, design

`fit/stage1.py`. The question is how much of the measured articulator motion a target-and-interpolate
model accounts for, so everything that is not the movement law is taken from the corpus:

- **The model runs on the speaker's clock.** `lab/trajectories.js --seg` feeds the planner the
  corpus's own phone string with the corpus's own segment durations (`buildWord`'s `durs`, which
  replaces the duration model and nothing else; each glide is centred on its boundary). Stress and
  word position come from the Festival utterance structures. So the two trajectories share a time
  axis and no time-warping is needed.
- **Two target sets.** *Engine*: the Edinburgh voice as shipped — the speaker's vowels through the
  stage 0 map, the shared consonants. *Speaker*: his own mean measured posture for every phone
  (`out/stage1/speaker_art.json`, from the training utterances, laid over the voice with `--art`).
  The second exists because stage 0 registered only the vowels; every consonant target in the
  shared table is still an acoustic knob with an anatomical name, and a transition into a vowel
  from an anatomically wrong place is a wrong transition whatever the movement law does.
- **Compared in diameter space, reported by tract region.** The measured posture goes forward
  through `articulate` once and is cached; the model's diameters come straight off the running
  engine (`--diam`), so the search never inverts. The inversion is kept for the posture-space
  table, warm-started from the planned posture rather than the previous frame — started from the
  previous frame, a parameter the diameters do not pin (tip position under a flat tip hump)
  random-walks and reported an R² of −47 on the held-out set. In diameter space nothing is
  invisible.
- **Vowel frames are the trusted ones**, because the map was validated on vowels. All-frame numbers
  are reported beside them with that caveat.
- **Two static baselines** bracket the dynamic model: the current segment's target held flat, and
  the speaker's per-phone mean posture — the best any lookup table can do.
- **Fitted**: `artT artCrit artStiff artPush artFar` (the five the identifiability pass found) and
  `glide`, by shrinking-step coordinate descent on 120 training utterances; scored on the corpus's
  63-utterance test split, which the fit never sees.

## Stage 1, measured

Variance explained (R²) in diameter space on the 61 held-out test utterances, 39,519 frames, all
models on the speaker's clock. `python -m fit.stage1 report`; the full table by tract region is in
`out/stage1/stage1_r2_diam.csv`.

    model                                        vowel frames   all frames
    hold the engine's target, flat                   0.457        −0.174
    speaker's phone mean (static lookup)             0.482         0.411
    speaker's phone mean given both neighbours       0.568         0.507
    engine targets · defaults                        0.439        −0.151
    engine targets · no mass                         0.452        −0.204
    speaker targets · no mass (pure interpolation)   0.454         0.405
    speaker targets · defaults                       0.506         0.429
    speaker targets · fitted                         0.530         0.438

The fit (coordinate descent, 120 training utterances, vowel-frame diameter rms 0.347 → 0.339):
`artT` 0.016, `artCrit` 0, `artStiff` 0.355, `artPush` 0.45, `artFar` 2.3, `glide` 0.03 — less
mass than the default 0.025, no gesture treated as critical, stiffness keyed more to distance
travelled, and the shortest transition the range allows. Read together: the speaker moves faster and
more uniformly between targets than the engine's defaults do, and the one thing the follower is
doing for him is the smoothing.

**Read in three steps.**

1. **With the engine's consonant targets the movement law is worth nothing.** 0.439 against 0.457
   for holding the target flat: interpolating toward the shared table's consonants makes the vowel
   frames slightly worse, and the fit on those targets drove mass and glide toward zero, which is
   the optimiser turning the model into hold-the-target. The shared consonants are the acoustic
   knobs stage 0 found; a transition out of a wrong place is a wrong transition.
2. **With the speaker's own targets it is worth a little, and the mass is the part that works.**
   0.506 with the follower, 0.454 without it, 0.482 for the best static table. Every tract region
   gains except the lips, where the dynamic model loses to the static one (0.447 against 0.577) —
   the lip follower is too slow, or the lips are not a critically damped mass, and either is a
   finding for the engine.
3. **The residual is structured, and this model captures half of the structure once fitted.** A
   lookup that knows the neighbouring phones reaches 0.568. Between "phone" and "phone in context"
   lie about nine points of variance; target-and-interpolate recovers two and a half of them at the
   defaults and five when fitted. The other four are what stage 2 is about, and they are already
   known to be there.

On RESEARCH.md's own scale this sits on the line between "below ~50%" and the expected range — 53%
in the trusted frames, 44% overall — and the instruction to suspect the mapping first applies. Two parts of the mapping are suspect
by construction: the stage 0 map was fitted on vowel means and is here applied frame by frame to
everything, and the speaker's consonant targets are that map's linear extrapolation, which never
closes. The same-speaker MRI is the check on both.

The posture-space table (`out/stage1/stage1_r2.csv`) is kept for completeness and is not the
headline: tip position under a flat tip hump is not in the diameters, so its R² there is noise
whatever the model. Per-frame residuals for stage 2, with the linguistic columns, are in
`out/stage1/residuals_test_speaker_*.csv`.

## What this answered before any corpus arrived

`python -m fit.identify` plants each control parameter at a known value, generates the trajectory it
produces, and searches for it on a grid. It needs no measured data, and it decides what stage 1 can
honestly claim to fit. Two probe utterances, voice john:

    parameter    planted    found        span   verdict
    artT            0.03     0.03     0.12135   identified
    artCrit            2        2     0.06365   identified
    artStiff         0.5      0.5     0.08154   identified
    artPush         0.45     0.45     0.02479   identified
    artFar           1.4      1.4     0.05387   identified
    velT            0.03        0     0.00000   FLAT

**Five of the six are recoverable from a trajectory alone.** That is the precondition stage 1 needed
and it now has evidence rather than an assumption.

**`velT` is not, and it is structural rather than a shortage of nasals.** It governs the velum and
the lateral pocket, which move `nasal` and `bOpen` — not `diam`. The six-parameter posture space has
no velum in it, so the velum's time constant cannot appear in a posture trajectory under any
circumstances. Checked on a nasal-heavy probe (*"many men mean nothing"*, *"morning moon"*): span
exactly 0.0, while `artT` on the same two utterances spans 0.105, so the probe can certainly see
something.

The consequence for stage 1: **do not fit `velT`, and do not report a fitted value for it.** Making
it fittable needs the nasal aperture exported as its own channel *and* a corpus with a velum sensor
— mngu0's day 2 has one and has never been released, MOCHA has one on two of its three validated
speakers.

## Why the planted-answer test comes first

`lab/fit-auto.js` refuses to run without an isolation pass, because its first version "succeeded" by
driving the knobs it was tuning to their off values. `lab/fit-dynamics.js --check` plants a known
voice and reports recovery. `lab/artspace.js` does the same for the posture inversion. A fitter is
not believed here until it has recovered a planted answer, and obeying that rule costs nothing
before the data arrives — it is the one part of stage 1 that can be built and validated today.

`tests/test_recovery.py` also pins the finding the whole `--actual` path exists for: `artT` moves
the spoken track and leaves the planned articulator columns bit-identical. If that ever stops being
true, a good deal of `RESEARCH.md` needs rewriting, and the test says so.
