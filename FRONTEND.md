# Front end: one session, three views

**Status: plan. Nothing here is built yet.**

## What is wrong

Three pages — `index.html`, `wizard.html`, `lab/bench.html` — each hold their own copy of the
same four things: loading the engine, starting the audio, holding a voice, and turning text into
sound. They were written at different times and have drifted, so **the same voice saying the same
phrase behaves differently depending on which page you are on.**

Measured:

| | index | wizard | bench |
|---|---|---|---|
| applies a voice's fitted postures (`art`) | yes | **no** | yes |
| clamps duration at 5 seconds | **yes** | no | no |
| passes `open` | no | no | **yes** |
| lines of code | 1984 | 389 | 1222 |

The consequences are not subtle. `johnfit` carries **26 fitted postures** that the wizard never
applies, so a fitted voice is spoken there with somebody else's tongue. And the Austen passage
runs **6.62 s** on the main page against **8.77 s** on the other two — the same text, 1.32 times
longer on one page than another, because the main page's clamp exists to match a slider that the
other two do not have.

Every bug of the "the voice got lost" or "the phrase stopped working" kind lives in this gap.
There is no shared definition of what the current voice IS, so each page invents one and they
disagree.

## The shape of the fix

**One session, three views.** A session owns the engine, the audio, the current voice and the
current phrase. A view is a page that renders it: the tract animation, the guided questions, the
test batteries. Views never talk to the engine directly.

That is the whole idea. The phases below are an order to arrive at it in, not four separate
projects, and each one is shippable on its own.

---

## Phase 1 — one speak path  ✅ built

**The single highest-value step, and the smallest.**

Extract `speak(text, voice)` into a shared module. One place that decides how a chain becomes a
word: how D is computed, whether `art` is applied, what `rate` is, which options are passed.

Fixes the three divergences above immediately, because there stops being anywhere for them to
live. The 5-second clamp goes with it — that ceiling belongs to a slider, and a slider is a view
concern.

*Risk:* low. Three call sites, one function, and the gate already checks what a built word should
look like.

*Done when:* the same voice and phrase produce a bit-identical word on all three pages.

## Phase 2 — one engine, one start  ✅ built

Extract loading and audio start. Currently three implementations: `loadEngine` + Blob worklet in
index, a near-copy in the wizard, and `findSource` with URL fallbacks in the bench.

This code has already produced two bugs on its own — the version-token skew that fetching fixed,
and the start race where a flag was set before the node existed. Both were fixed **once**, in one
copy. The wizard was written afterwards and shares one shared-promise fix by luck rather than by
construction.

*Risk:* low-moderate. The bench's fallback URL search is doing real work for the `?src=` query
parameter and has to survive.

*Done.* `HOLLER_SESSION.loadEngine` and `HOLLER_SESSION.startAudio`; each page keeps an
eight-line bootstrap that fetches session.js and nothing else. The `?src=` search survives, since
that is how the bench compares two checkouts.

**And it found a fourth divergence nobody had named: the bench had no warm-up.** index.html and
the wizard idle 300 ms before the first word, because the engine is interpreted before it is
compiled and cold it is twice as slow as real time — the first word dropped samples, which sounds
exactly like a click. That was diagnosed and fixed on the main page some time ago. Nobody carried
it to the bench, and the bench has been popping on its first play ever since.

## Phase 3 — the shared selector

**What was actually asked for.** A voice picker and a phrase picker, the same component in all
three pages.

- **Voice:** the presets, plus paste-a-seed, plus whatever the wizard's questions have built.
- **Phrase:** the bench's twelve, the wizard's six passages, and type-your-own — one list, since
  there is no reason a bench phrase cannot be read in the wizard or a passage swept in the bench.

*Risk:* moderate. It is UI, and the three pages have different layouts and different amounts of
room. The component has to be small enough to sit in a header.

*Done when:* picking a voice or a phrase looks and behaves the same everywhere.

## Phase 4 — state that survives the trip

Voice and phrase persist across navigation. Tune a voice in the wizard, press Bench, and it is
the same voice saying the same phrase.

Carried in the URL rather than in storage, so a link is shareable and a state is reproducible:
`bench.html#v=<seed>&say=<text>`. The seed format already does the hard half.

*Risk:* low, and it is the thing that makes three pages feel like one tool rather than three.

*Done when:* every navigation between pages preserves both, and a pasted link reproduces exactly
what the sender heard.

---

## What this is not

Not a redesign. The tract animation, the bench's batteries and the wizard's questions are all
doing their jobs and none of them change. This is about the four things underneath them being one
thing instead of three.

## Order and why

Phase 1 first because it fixes real audible divergence for the least work. Phase 2 next because
it removes the code that has already caused two bugs. Phase 3 is the request, and it is easier
once 1 and 2 have given it a session to select *into*. Phase 4 is small and only makes sense last.

Phases 1 and 2 could ship together. Phase 3 should not start before them, because a shared
selector over three disagreeing implementations would just move the disagreement.
