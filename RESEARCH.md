# Two questions about controlling a throat

**Status: a proposal to argue with. Nothing here is started.**

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

Whether articulatory features as an AUXILIARY objective have been tried for text-to-speech. They
are established in speech recognition — the dysarthric-speech literature uses exactly this — but
recognition and synthesis are different problems and the result may not transfer. **This is an
afternoon in the literature and it should happen before any code.** If arm C has been run, its
result decides whether the rest is worth starting.

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

**On your machine, not a cloud VM.** One pass over mngu0 is under three seconds and the parameter
search is under two hours single-core, which any desktop parallelises to minutes. And the corpora
carry licences: mngu0 and MOCHA both require agreeing to terms before download, and putting the
data on third-party infrastructure may breach them. Local avoids the question.

**Node for the trajectories, Python for the fitting.** `lab/trajectories.js` emits the model's
articulator track as CSV; Python does the regression and the plots.

Not a Python port of the engine. A second implementation drifts from the first — which is the
exact fault this project spent a week removing, three times over — and it carries the extra hazard
that the model being fitted is not the model anyone has listened to. The trajectory generator has
to be the engine itself.

    node lab/trajectories.js --in utterances.txt --out tracks.csv --voice john --rate 200

One utterance a line, optionally `id<TAB>text` so the corpus's own identifiers come through. It
renders no audio: fitting compares trajectories, and skipping the acoustics is what makes a corpus
pass cost seconds.

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
