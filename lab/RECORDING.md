# Recording a voice

One file per person. Say each item **once**, with a clear pause between — the analyser splits on
silence, so the pauses are what make the labels line up. Phone voice memos are fine; any format
ffmpeg reads works.

The recording itself is **not** kept in the repo. Only the fitted result is — `VOICES.john.art`
and `VOICES.john.v`. That means a fit cannot be re-derived or checked from what is here, which
is a real limitation: keep your audio and the `voice-fit.json` somewhere you will still have
them in a year.

---

## Part 1 — the voice (unchanged from the first protocol)

These are exactly the items recorded before, in the same order, so a new take is directly
comparable with the old fit rather than a fresh start.

**Sustained** — the single most useful item
> "uhhhhhh" — about three seconds, steady, comfortable pitch

**Vowels** — the Peterson & Barney /hVd/ set, directly comparable to the data the model targets
> heed · hid · head · had · hod · hawed · hood · who'd · hud · heard

**Consonants**
> bad · pad · dot · tot · goat · coat · sue · shoe · fan · van · led · red · ram · ran · rang

**And**
> GOOOOAAALLL

That part fits **tract length, per-vowel articulation, Rd, pitch and rate** — six parameters and
twenty-six postures.

---

## Part 2 — how you speak

New. Everything above describes *what your voice is*; none of it describes *how you talk*. The
prosody layer is eleven of the twenty-nine parameters, it is what made the largest audible
difference so far, and every one of its values is currently a published average from 1960
measured on somebody else.

**Coda voicing and closure length** — `coda`, `stopVc`
Vowels are longer before a voiced consonant, and voiceless closures are held longer. Say each
pair back to back, same rhythm.
> bat · bead · beat · bide · bite
> *(pairs with "bad" from Part 1: bad/bat, bead/beat, bide/bite)*

**Polysyllabic shortening** — `poly`
Syllables get shorter as a word gets longer. Say all three at the same speaking rate.
> cap · captain · captaincy
> stick · sticky · stickiness

**Unstressed reduction** — `wkdur`, `wklev`
How much shorter and quieter your weak syllables are than your strong one.
> banana · tomato · computer · together

**Final lengthening** — `fnl`
Say this as **one breath with no pauses**, all three the same word:
> "cat cat cat"

**Accent depth** — `acc`
Two versions of nearly the same sentence. Put real contrastive stress on the capitalised word in
the first, and say the second flat.
> "I said BAD, not bat."
> "I said bad and bat."

**Connected rhythm** — ground truth for the bench
The phrases the lab already tests against, so synthesis can be compared with you saying the same
thing rather than with a judgement about it.
> "hello world"
> "I love my daughter"
> "my wife is great"

---

## Short set

If you are recording a child, or anyone impatient:

> "uhhhhhh" (three seconds) · heed · had · hod · who'd · hud · their own name · GOOOOAAALLL
> · banana · cap · captain · captaincy

Twelve items. Tract length, pitch, voice quality, the cry, and enough for `poly` and a first
look at reduction.

---

## Running it

    python3 lab/voice-fit.py <file> --labels uh,heed,hid,head,had,hod,hawed,hood,whod,hud,heard,\
    bad,pad,dot,tot,goat,coat,sue,shoe,fan,van,led,red,ram,ran,rang,goal,\
    bat,bead,beat,bide,bite,cap,captain,captaincy,stick,sticky,stickiness,\
    banana,tomato,computer,together,catcatcat,focus,neutral,helloworld,lovedaughter,wifegreat

    node lab/fit-preset.js voice-fit.json <name>

## What gets fitted, and what is only collected

| from | parameter | status |
|---|---|---|
| /hVd/ formants | `sect`, 26 postures | fitted |
| H1−H2 | `rd` | fitted |
| F0 | `f0a` `f0b` `f0c` | fitted |
| word durations | `per` | fitted |
| /hVd/ **durations** | `vlen` | fitted — same words, a measurement nobody had taken |
| cap/captain/captaincy | `poly` | fitted |
| bad/bat, bead/beat, bide/bite | `coda`, `stopVc` | **collected only** |
| banana, tomato, computer | `wkdur`, `wklev` | **collected only** |
| cat cat cat | `fnl` | **collected only** |
| focus vs neutral | `acc` | **collected only** |

"Collected only" means the analyser reports one duration per item and these need **within-word**
segmentation to separate a vowel from its closure, or one syllable from the next. The audio is
worth having now — the analysis can catch up later, and re-recording because the tooling arrived
second would be the avoidable mistake.

## The impersonation experiment

Record the same list twice — once normally, once *as* Barry White. You cannot grow a vocal
tract, so the difference in fitted length is exactly how much lengthening larynx-lowering and lip
protrusion actually buy. Everything beyond that is source and prosody, and the diff says which is
which.

## Known limits

- Tract length came back ~8% low on a synthetic test where the truth was known. The fitted
  articulations compensate, so the sound matches even where the number drifts.
- H1−H2 to Rd is an approximate mapping; expect to tune it by ear afterwards.
- `vlen` and `poly` are fitted from **word** durations. In /hVd/ the onset and coda are constant
  so a word-duration difference is a vowel-duration difference, and in cap/captain/captaincy the
  syllable count is what varies — both are sound. Anything needing a vowel measured *separately
  from its own coda* is in the "collected only" list above for exactly that reason.
