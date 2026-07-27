# One app, a front door, and rooms behind it

**Status: a vision to argue with. Nothing here is built.**

## What is wrong, and it is not the code

Every page works. The engine is good. What is missing is an answer to *"what is this and where do I
start"*, and the reason is that **`index.html` is doing four jobs at once**:

| job | references in the file |
|---|---|
| the word editor | 54 |
| voice presets | 48 |
| the knob panel | 44 |
| the spectrogram | 22 |
| the tract animation | 13 |

Two thousand lines, and the tract animation — the thing worth showing anybody — has the fewest
references of the five. **Advanced is a button rather than a place**, so the first thing a person
sees is a phoneme keyboard, forty knobs and a word that says *goal*.

The wizard does one job and is a quarter the size. The bench does five jobs but they are all lab
jobs, so it coheres. The problem is concentrated in one file.

## The shape

**A front door, and four rooms.**

### The front door — *Listen*

The throat, moving, saying something worth hearing. **A famous line, in a good voice, at real
speed.** Three controls: play, which phrase, which voice. Nothing else on the screen.

This is the showcase. Somebody who never clicks anything else should still have seen the thing
work and understood what it is.

*Default phrase:* **"To be, or not to be, that is the question."** Checked, not chosen by taste —
the speller says it correctly, it carries two commas and a full stop so the punctuation work is
audible, and it is the most recognisable line in English. Dickens and Frost also come out clean
and go in the list. Armstrong gives /smæl/ for "small" and Apollo gives /haʊstən/ for "Houston",
so neither can be the thing a stranger hears first.

*Default voice:* not the announcer. The goal cry is a party trick the project grew out of, and it
is the worst possible introduction to a vocal tract, because it is the one thing a vocal tract
does that does not sound like speech. It stays as a preset and as a phrase — *goal* is a fine
thing to have in the list — and the door opens on a voice that talks.

### Room 1 — *Make a voice*

The wizard, unchanged in spirit: four questions with audible answers, then a walk. What changes is
that the voice it makes is **the same voice the front door is holding**, so designing one and then
watching the throat say it is one gesture rather than two pages.

### Room 2 — *Look inside*

The same throat, with the anatomy named. The Mouth view, the tube view, the spectrogram, the
section count and the length in centimetres. Everything that answers *how does this work* rather
than *what does it sound like*.

Currently this is mixed into the front door, which is why the front door has forty controls.

### Room 3 — *Build a word*

The phoneme keyboard and the chain editor. A real tool with a real audience — it is how you find
out that /dʒ/ is spelled d+ʒ and comes out *doo-ump* — and no business being the first thing
anybody sees.

### Room 4 — *The lab*

The bench, as it is. Sweeps, pairs, the tournament, the knob panel. It already knows what it is.

## Why this works now and would not have before

The session layer already exists. Voice and phrase are carried in the URL, the speak path is
shared, and the engine loads once from one place. **Splitting a page no longer means splitting
its state**, which is exactly why it would have been a bad idea a week ago.

## What it costs

`index.html` loses roughly two thirds of itself to rooms 2 and 3. That is the whole job. The
wizard and the bench barely move.

## The thing to decide first

Whether the front door is a **fifth page** or the current one with the rest moved out. A fifth page
is cleaner and costs a redirect; reusing `index.html` keeps every existing link working. I lean to
reusing it — the animation is already there and it is the part nobody wants to rewrite.


---

# The plan

Five phases. Each ships alone and leaves the app working.

## Phase 0 — the wizard's dead buttons  ⚠ do this first, it is a bug

Five of the wizard's controls have **no event listeners at all**: `playA`, `playB`, `keepA`,
`keepB`, `battleOff`. The whole walk is dead — the buttons render and do nothing.

Introduced in phase 3 of the last piece of work, by me: the regex that rewired the phrase picker
swallowed the block that wired the battle, and nothing caught it because no check reads that page
for wiring. That is the "fragile, stops speaking" report, and it is not fragility. It is absence.

**Also here:** a tract-length guard. Keyframes built for a 26-section tract and played on a
44-section one produce **72,064 non-finite samples — NaN, and silence rather than a crash.** The
bench has a `workletN` that tracks what the processor actually has; the wizard assumes its local
`N` matches, and the size question changes `sect`. That belongs in session.js with the rest of the
audio, and then no page can get it wrong.

*Add a check that every control on every page is wired,* since this class of fault is invisible to
everything the gate currently does.

## Phase 1 — the front door

`index.html` opens on the throat, a phrase and a voice. The word editor, the keyboard, the knob
panel and the spectrogram move behind a link.

Default phrase becomes the Shakespeare; default voice becomes one that talks. The announcer stays
a preset and *goal* stays a phrase.

*Done when:* a stranger who clicks nothing has heard a famous line spoken by a moving throat.

## Phase 2 — Look inside  ❌ withdrawn, it was the wrong idea

**Withdrawn after looking properly.** The anatomy *is* the showcase: the Tube and Mouth toggle,
the cylinder count, the length in centimetres and the colour key are what make the front door
worth looking at rather than a picture with nothing to read. Lifting them out would leave the
door emptier and the tool no clearer.

Counted rather than assumed: the front door shows **eight** controls, of which two are the view
toggle and two are doors to rooms. The phoneme keyboard and the knob panel were already behind
buttons. Phase 1 had already done the work this phase was invented to do.

## Phase 3 — Build a word  ❌ withdrawn, already true

The phoneme keyboard and chain editor, also lifted whole. It keeps its own page and gains the
shared voice and phrase, so a chain built by hand can be heard in any voice and watched in the
throat.

## Phase 4 — one way between rooms  ✅ built

**This was the phase that mattered**, and finding that out cost nothing but looking.

index offered *Make a voice · Bench · About*. The wizard offered *Back · Bench*. **The bench
offered nothing at all** — a page you could reach and could not leave. "Back" did not say where
it went and "Bench" did not say what it was.

One list now, in session.js, named for what each room is *for*: **Throat · Make a voice · Lab**.
The page you are on is marked rather than omitted, because a navigation that hides the current
page makes every page look like a different app. Links carry voice and phrase, which is what
makes the three feel like one tool rather than three.

---

## Order, and what could go wrong

Phase 0 is a bug fix and blocks nothing. Phases 1 to 3 are one job done in three sittings: every
one of them is *move code out of index.html*, and the risk is entirely in the moving, not in the
design. Phase 4 is trivial once there are five pages to link.

**The one real risk** is that the front door becomes too thin to be interesting — three controls
and a picture. The mitigation is the phrase list: fifteen things worth hearing, each with a note
about why it is in there, is itself a reason to keep pressing play.
