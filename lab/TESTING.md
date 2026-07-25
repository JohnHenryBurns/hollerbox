# Testing by ear, and telling me what you heard

I cannot hear anything. Every measurement I take is a proxy, and the record in `ROADMAP.md`
says how that goes: **seven confident diagnoses in this project have not survived contact with
the evidence**, several of them mine, and four of them in a single investigation into one
complaint about pops. The pops turned out to be the breath noise, which was filed as a separate
fault two entries away in the same file and had never been connected to it.

What has actually worked, every time, is the same shape:

> you localise it → I ablate it → the measurement either moves or it does not

So this is written to make localising cheap. **Where** and **when** beat **what**, and an A/B
beats a verdict.

---

## Before a session

1. Pick the voice in the dropdown — **john** unless you are hunting monsters.
2. **Knobs → All defaults.** Otherwise you are testing yesterday's tuning without knowing it.
3. Pick one phrase and stay on it for the whole comparison. Changing phrase and knob together
   tells you nothing about either.
4. Play it once before touching anything. That is your reference, and you will need it, because
   the second and third listens of anything always sound different from the first.

The panels **share one voice**. Tuning in Knobs changes what the Tournament starts from and what
the Phrases tab plays. That is deliberate, and it means state leaks between tabs — if something
sounds unexpectedly wrong, hit **All defaults** before believing it.

---

## The three tests, in order of information per minute

### 1. The whole layer — `Phase 8 off`

One button, nulls all ten prosody knobs: `vlen coda wkdur wklev fnl poly stopVc acc pert gcap`.
Off is the engine as it behaved before any of Phase 8 existed — same lengths, same closures,
same levels, bare pitch contour. Gated, so it is genuinely that and not approximately.

This is the only test that answers *"is the phase worth having"*, and it is the one that found
Phase 8 was a net loss the first time.

### 2. One knob to its null — `∅`

The bisection. Something sounds wrong; null one effect and hear whether it goes. The `∅` button
sits on every knob that has a meaningful off:

| group | knob | default → null | what it stops doing |
|---|---|---|---|
| stress | `wkdur` | 0.60 → 1 | shortening unstressed syllables |
| stress | `wklev` | 0.65 → 1 | quieting them |
| stress | `acc` | 3 → 0 | putting a pitch accent on the stressed one |
| pitch | `pert` | 1 → 0 | raising the vowel after /p t k/, lowering it after /b d g/ |
| rhythm | `vlen` | 1 → 0 | making tense vowels longer than lax ones |
| rhythm | `coda` | 1 → 0 | lengthening a vowel before a voiced consonant |
| rhythm | `fnl` | 1.25 → 1 | stretching the last syllable |
| rhythm | `poly` | 0.12 → 0 | shortening long words |
| rhythm | `stopVc` | 1.5 → 1 | holding /p t k/ longer than /b d g/ |
| rhythm | `gcap` | 0.5 → 3 | capping a transition against the segment it joins |
| source | `brth` | 0.18 → 0 | breath noise in the voice |
| source | `jit` | 1 → 0 | vocal-fold irregularity |
| source | `press` | 0.45 → 0 | effort pressing the folds at the peak |

### 3. Sweep one knob

Drag it slowly end to end while hitting space. Tells you whether the default is in the right
place, which nulling cannot. **Change one knob at a time** — the whole reason the tournament
searches one group at a time is that a change you cannot attribute teaches nothing.

**Space plays.** It works while a slider has focus, on purpose, so the loop is drag, space,
drag, space without reaching for the mouse.

---

## Saying what you heard

The most useful sentence names **a sound, in a word, in a phrase**, and compares two states.

> *"In `my wife is great`, the /f/ of wife has a click on the way in. With `gcap` at 3 it is
> worse; with `brth` at 0 it is gone."*

That is three ablations already done and I can go straight to the mechanism. Compare:

> *"still sounds robotic"*

which is true, unactionable, and was true of eight phrases at once.

### Words that map onto something I can measure

| you say | I measure |
|---|---|
| slurred, mushy, running together | how much of each segment is spent at target vs in transit |
| pops, clicks, crackle, static | transient count, spectral tilt, energy near Nyquist |
| robotic, flat, monotone | F0 excursion on stressed syllables, level spread across syllables |
| buzzy, electronic, too clean | harmonic-to-noise, jitter |
| hissy, sibilant, whistly | fricative band energy and centre frequency |
| muffled, dull, boxy | spectral centroid, lip radiation, damping |
| wrong sound entirely | the speller — **send me the word**, this is usually not the engine |
| rushed, dragging, uneven | segment durations, `per`, the glide cap |

### What to send

```
voice    john
phrase   my wife is great
seed     fz6hc0qnawk41514192wafci4ad9om1t1j00i0i077b2f0eei0cfkpi0
change   acc 3 -> 0
heard    the emphasis on "great" goes away; the whole phrase flattens
verdict  worse
```

The **seed is the whole voice** — 58 characters, every one of the 29 parameters. Copy it from
either the Knobs or the Tournament panel. With it I can reproduce exactly what you heard, diff
it against the defaults, measure it, and run the gate against it. Without it I am guessing at
which of 29 numbers you had moved.

Old seeds still load. They are positional, so a 56-character seed from before `gcap` existed
loads fine with the new knobs at their defaults.

**Send several at once when you can.** What your favourites have in *common* is worth more than
any one of them — if three good voices are all reaching for the same corner of `sect`/`damp`,
that is a finding about the model rather than about a voice.

---

## Two things worth doing right now

**Did the breath fix go far enough?** The pops were the breath noise climbing toward Nyquist,
and the tilt now measures −5.7 dB/oct against a real −6 to −12. If there is still crackle, pull
`brth` down toward 0.10 and tell me whether it goes — because if it does not, there is a second
source and I have been measuring the wrong thing again.

**Is Phase 8 net positive yet?** It was not, before `gcap`. `Phase 8 off` against on, over
several phrases, is the whole question, and it is one button.
