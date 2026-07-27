# What is the simplest law that reproduces the movements a brain produces?

**Status: a proposal to argue with. Nothing here is started.**

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

**It is fast, and the number matters more than the adjective.** Measured: planning a
nine-word utterance to a full articulator track takes **2.17 ms** on one core, no audio rendered —
trajectory fitting does not need the audio. So:

- one pass over all of mngu0 (~1,300 utterances): **2.8 seconds**
- a 2,000-evaluation search over the ten control parameters: **1.6 hours**

That is a laptop overnight, not a cluster allocation. Most articulatory models solve aero-acoustic
equations per sample and cannot be fitted at this scale at all, which is a real part of why the
control literature is thin on large fits — and it is the single strongest argument for using this
engine rather than a better one.

**It is interpretable.** Six articulator degrees of freedom — `jaw`, `bodyPos`, `bodyHi`,
`tipPos`, `tipHi`, `lip` — and ten control parameters with physical meanings. A fitted value is a
claim about speech, not a weight.

**It already emits the thing to be compared.** `buildWord` returns a per-frame articulator track.
The comparison to measured data is a comparison of two trajectories, not an inversion problem.

**It is calibrated to one speaker and instrumented.** Ninety-odd checks, ablation-verified. When a
fit changes something, it is possible to find out what.

## The data

Public electromagnetic articulography corpora, so the expensive half — collection — is already
done:

| corpus | what it is | the catch |
|---|---|---|
| **mngu0** | one British English speaker, ~1,300 utterances, EMA + audio | one speaker; registration |
| **MOCHA-TIMIT** | two speakers, 460 sentences each | small; older sensor conventions |
| **USC-TIMIT / rtMRI** | real-time MRI, several speakers | image data, needs segmentation first |

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

### Stage 1 — how far does target-and-interpolate get?

Drive the model from the phoneme string of each utterance. Fit the ten control parameters to
minimise trajectory error against the measured articulators. Report **variance explained per
articulator**, held out by utterance.

**What each outcome means:**

- **Above ~90%** — the framework is adequate and the interesting problem is elsewhere. A short,
  useful, deflationary paper. Also the outcome that makes this project a dead end, so it is worth
  wanting to know early.
- **60–85%** — the expected range, and the one worth pursuing. The residual is large enough to
  characterise.
- **Below ~50%** — either the mapping from stage 0 is wrong, or something fundamental is missing.
  Suspect the mapping first.

### Stage 2 — is the residual structured?

The actual question. Regress the per-frame residual against everything linguistic that is
available: lexical stress, position in phrase, speaking rate, syllable position, identity of the
neighbouring gesture, distance still to travel.

- **Structured** → that structure is a control principle stated quantitatively, and it can be
  added to the model and tested for whether it improves the fit on held-out data. This is the
  finding worth publishing.
- **Unstructured** → target-and-interpolate is adequate at this level. Publish that; it constrains
  what everyone else should be working on.

### Stage 3 — does it generalise?

Refit on MOCHA-TIMIT's two speakers without re-tuning. Anything that survives a different speaker
and a different sensor convention is a claim about speech. Anything that does not is a claim about
one person, which is worth saying plainly rather than quietly.

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

**Known effects will be rediscovered.** Undershoot, coarticulation, phrase-final lengthening and
the utterance-length law are all documented. Rediscovering them is a validation that the method
works, not a result — and the temptation to present them as results should be resisted.

## Feasibility

**Stage 0 alone is a few weeks** and decides whether the rest is possible.

**Stages 0–2 on one corpus is a few months of focused work** and a workshop paper if the residual
is structured, or a short negative-result note if it is not. That is a real and achievable
contribution.

**Stage 3 and a control model that generalises across speakers and rates is the thing the field
has been asking for since 2008.** It is unsolved because it is hard, not because nobody tried. It
should not be the plan; it should be the thing the plan might earn a look at.

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
