# lab

Everything that is not the app. Nothing here ships; it exists to keep the app honest.

## Layout

    engine/tract-worklet.js   THE ENGINE. One copy, loaded by URL.
    engine/phonemes.js        THE PHONEME LAYER. One copy: shapes, classes, voices, buildWord.
    index.html                the app: UI, rendering, delivery — it aliases the layer above
    lab/                      the gate and the instruments
    lab/bench.html            the consonant bench (served, but not part of the app)

The engine used to live inside a template literal in `index.html`, which forced every
consumer to re-derive it by regex and to fake its one `VELAR` interpolation. It is a file
now: the page calls `audioWorklet.addModule()` on it, `harness.js` reads the same bytes,
and construction parameters arrive in `processorOptions: { n, velar }`. When you change
the engine there is one place to change it.

The phoneme layer went the same way as the engine, and for the same reason. It lived inside
`index.html`, so `bench.html` pulled ART, the class tables, the voices and `articulate` back out
of the page with fifteen regular expressions, and `harness.js` did the same and then kept its
**own near-copy of `buildWord`** called `plan()` — with a comment admitting that a harness
carrying its own slightly different copy is exactly how a gate ends up testing the wrong thing.
It was right. `buildWord` could not be shared because it closed over `N` and the selected voice;
it now takes them as arguments, and all three consumers call it. Before the copy was deleted the
two were compared over **64 word x voice combinations — keyframes and segments identical to
1e-12**.

`tract.js` is still a hand-written mirror and is now the ONLY remaining drift risk. It is used
only for transfer-function work (the uniform-tube check and `formants()`); everything that
must match the app goes through `harness.js`.

## Scope

The per-voice checks run **john** and **man** by default — the two being tuned. Ten presets
is slow and most of them are nobody's target.

    node lab/check.js                    # john + man
    HOLLER_VOICES=woman,child node lab/check.js
    HOLLER_ALL=1 node lab/check.js          # all ten, before a release

## Testing by ear

[TESTING.md](TESTING.md) — how to use the Knobs panel to localise a fault, and what to send back
so it can be acted on. Written because every measurement here is a proxy and the roadmap records
seven confident diagnoses that did not survive one; what works is *you localise it, I ablate it*.

## The gate

    node lab/check.js            # 19 gate checks, ~28s, blocks
    node lab/check.js --report   # + 5 measurements, ~43s, never blocks

One command, one verdict, exit 0 means shippable. It drives the **shipping engine**, extracted
straight out of `index.html`, so it cannot drift from what actually runs.

### Two tiers, because two different things were wearing the same coat

A **gate** check asserts something that must be TRUE. The output is finite. Nothing sounds after
a word ends. A uniform tube resonates at c/4L. The stress array is the same length as the phone
array. These never need recalibrating when the engine legitimately changes, because they were
never describing this build in particular.

A **report** check MEASURES. /s/ sits at 4650 Hz. /ʃ/ carries 54% of its energy above 3 kHz.
Harmonic-to-noise is 23 dB. Worth knowing, worth watching, **not worth blocking on** — every one
of those bands is a snapshot of one calibration, so it goes red when something is DIFFERENT
rather than when something is WRONG. Two dozen commits of re-tuning bands was the predictable
result, and the tier split is the fix. Report lines print with a `·`, or `⚠` if they have moved,
and never change the exit code.

### Determinism

The engine calls `Math.random()` nine times per sample, so two renders of the same word were
never the same audio, and every band had to be wide enough to cover the spread. The harness now
seeds it and **reseeds before every render**, which matters more than seeding once: seeded once,
render N depends on renders 1..N-1, so the answer depends on which checks ran first and how the
job pool happened to schedule them. Reseeded per render, a render is a pure function of its
arguments — verified bit-identical across repeated runs and across `HOLLER_JOBS=1` versus the
parallel pool.

That purity is also what makes the render cache sound. It is not an optimisation bolted onto a
random process; it is the same call returning the same answer.

    HOLLER_SEED=n    a different seed
    HOLLER_SEEDS=k   re-run every check across k seeds and require them to agree

`HOLLER_SEEDS` is the "five consecutive runs" rule from the roadmap, made cheap and explicit
instead of something you remember to do by hand. All 19 gate checks agree across 5 seeds.

### Running less than all of it

The gate gates **correctness**. It should not gate **iteration**. Checks register rather than
running on registration, so a subset can be selected by substring:

    node lab/check.js --list             # the 22 names, instantly
    node lab/check.js stops              # just the stop checks — ~5s, not ~90
    node lab/check.js fricative,sibilant # comma or space separated
    HOLLER_ONLY=nasal node lab/check.js     # same thing via the environment

    HOLLER_JOBS=4 node lab/check.js         # spread over cores (defaults to the core count)
    HOLLER_JOBS=1 node lab/check.js         # force sequential
    HOLLER_BAIL=1  node lab/check.js        # stop at the first failure

Results print **as they finish** rather than after all twenty-two, so a run can be watched and
abandoned. A filtered run ends in a yellow verdict that says explicitly that it was a subset —
a partial pass must never be mistaken for a green gate. `ship.sh` runs the whole thing unfiltered.

### Why it costs what it costs

**82s -> 28s** for the blocking gate, from three changes and no loss of coverage:

| | |
|---|---|
| render cache (`sustain` ran 99 times for 31 distinct renders; `say` 29 for 24) | biggest single win |
| `extra` kept out of the cache key — a short render is a bit-exact prefix of a long one | three checks share a word list and differed only in tail length |
| five spectral characterisations moved to `--report` | ~15s off the blocking path |

The older measurements below still describe the per-render costs and are still worth reading
before optimising anything — in particular, the naive per-bin DFT probes still look like the
villain and still are not.


| | |
|---|---|
| `say()` sequenced render | **724 ms per second of audio** |
| `sustain()` render | 377 ms/s |
| render with no sequence running | 87 ms/s |
| `spectrum()`, the full DFT | 44 ms |
| `makeProcessor()` — evals the whole 34 KB engine | 1 ms |

**Measurement is about 5% of the gate; synthesis is the other 95%.** The naive per-bin DFT
probes look like the villain and are not — do not spend effort there. Nor on the `eval`.

A *sequenced* render costs eight times an idle one because `process()` does three O(n)
articulation passes per sample — an O(K) rescan of the keyframe list, an O(n) interpolation of
every diameter (from plain `Array.from` arrays, not typed ones), and an unconditional
`calcRefl()` — to move articulators that change at about 20 Hz. The tract shape is recomputed
44,100 times a second. Moving that to a control rate was measured at **1.4–1.6×, at a cost of
1.7 dB of spectral movement** — which would mean recalibrating the bands, so it is not worth
taking on its own. Take it when the nasal branch forces a recalibration anyway.

Two instruments lied on the way to those numbers, in the house style: a bit-exact buffer
comparison, which cannot work because the engine calls `Math.random()` on every sample, and a
control-rate patch that accidentally gated the sequence clock as well and reported a fake 5×.
Seed the RNG before comparing two builds.

    ./lab/ship.sh "commit message"       # syntax -> checks -> deploy, stops on any failure

`ship.sh` uses `set -euo pipefail` and no `&&` chaining, because three separate times a
broken build reached production through a masked exit code.

## Files

| file | what it is |
|---|---|
| `check.js` | the gate. Twenty-two checks with calibrated bands |
| `harness.js` | drives the shipping engine and the shipping phoneme layer — both are files it reads, not text it re-derives |
| `tract.js` | a standalone Kelly–Lochbaum tract, **mirrors the worklet**. Used for transfer-function work where running the whole engine is overkill |
| `ship.sh` | the deploy gate |
| `voice-fit.py` | measure a real recording: segment it, then F0, formants, H1–H2, spectral tilt per segment |
| `fit-preset.js` | turn those measurements into a preset — tract length from F3, articulations solved per vowel, source from the voice-quality measures, and a seed |
| `twomass.js` | standalone two-mass vocal-fold model. Prototype for the oscillator in the app |
| `lpc.js` | LPC formant estimation. **Kept as a warning**: it invents poles, and has misled this project six times |
| `RECORDING.md` | the script to read when recording a voice, and how to run the analysis |

## Two rules learned the hard way

**Bands are calibrated against a known-bad build, not guessed.** The click threshold sits where
it does because a deliberately over-driven burst measures 558% while the shipping build measures
177%. A guessed band flags healthy behaviour or misses real faults.

**Anything measuring a random process must average.** Frication is intermittent by design, so a
single render of /ʃ/ reports anywhere from 42% to 77% of its energy above 3 kHz. Measured once,
a check passes or fails at random — which happened twice, and the second time it laundered a
failure into a green tick. Five consecutive runs must agree before a gate counts as stable.

## Two rules about measurement

**Peak-pick the transfer function; do not trust LPC.** It placed an /ɛ/ F2 at 2490 Hz where the
spectrum has no peak at all. When two estimators disagree, plot the thing.

**`tract.js` mirrors the worklet and must be kept in step.** It carried its own copy of the
branch geometry once and drifted, so the gate was testing a tract the app did not have.
