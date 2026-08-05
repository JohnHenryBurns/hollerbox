# research

The fitting side of [RESEARCH.md](../RESEARCH.md). Node makes trajectories; Python does statistics
on them.

Nothing here models speech. `lab/trajectories.js` drives the same `buildWord` and the same worklet
the browser loads, and this reads its CSV. A Python port of the engine would drift from the
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
| `tests/` | the above, run against the real engine |
| `data/` | corpora go here. Gitignored, and see below |

## The corpora do not go in the repository

`data/` is gitignored. mngu0 is distributed on the condition that it is not passed on and MOCHA's
licence is non-commercial, so nothing measured is committed — only what was fitted from it. That is
the same split `lab/RECORDING.md` already applies to the reference recording.

mngu0 is **not** at `mngu0.org`. That domain lapsed and now serves an unrelated Korean phonetics
blog, and it returns HTTP 200, so a link-checker will not flag it. It is distributed from Korin
Richmond's Edinburgh page by email approval.

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
