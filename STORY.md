# How this happened

A running narrative of the project, kept in plain language. Not a spec and not a changelog —
those are the roadmap and the commit log. This is the story, tracked as it goes, so that a tight
version can be cut from it later.

**One rule for this file: no jargon.** If something can only be said in technical vocabulary it
does not go in here, because the whole point of the project is that it all comes back to one
plain question — *would a real throat actually do this?*

---

## It started as a joke that got out of hand

A football simulator narrates its own matches. It needed a stadium **GOOOOAAALLL**.

The easy answer is to record someone shouting and play the file. But then it's the same shout
every goal, forever, and everyone notices by the third one. The browser's built-in text-to-speech
was worse — it reads "GOOOAL" as *gull*.

So: make the computer shout. How hard could it be.

---

## Nine tries, five animals

The first approach cheated. Instead of building a throat, it faked the *sound* of one — take a
buzz, and carve it up until it resembles a voice.

That very nearly works. Nine attempts in, it had sounded, in this order, like **a ghost, a
sasquatch, a cow, a Spanish speaker, and a sheep.**

Every one of those was correct, and specific, and pointed straight at what was broken.

- The **ghost** was hollow because it genuinely was hollow. The method only produced three thin
  slices of sound, with silence in between. A real voice fills the whole range and merely
  emphasises some parts of it. Fixing that more than doubled the body of the sound.
- The **cow** was a mouth that wasn't open enough. A moo is a dark, closed sound, and that is
  exactly the shape the model was holding while trying to say "aaah".
- The **sheep** was a wobble — the loudness going up and down a few times a second, which is
  precisely what a bleat is. There is still an automated test named after it.
- The **sasquatch** was too much rasp. Real shouting does go rough and break into a growl, and
  there was far too much of it.
- The **Spanish speaker** was under-enunciation. Sounds that don't quite arrive where they're
  going read as an accent — because that is genuinely one of the things an accent *is*.

Five descriptions from someone with no background in acoustics, and each one landed on a real
fault. That pattern held for everything that came after, and it is the single most reliable
thing in the whole project.

Then we stopped faking it.

---

## Build the tube

The model is forty-four little cylinders of air in a row, from the vocal cords to the lips. Blow
in one end and a pressure wave travels along. Wherever the tube gets wider or narrower, part of
that wave bounces back — the same reason you get a note from blowing across a bottle, and a
different note from a different bottle.

That's it. That's the whole model. Nothing in the code knows what a vowel is.

Then you add a tongue, a jaw, and lips that can round.

And here is the moment the project became worth doing: **the vowels came almost free.**

Put the tongue in the right place and *ee* and *ah* and *oo* simply happen. We worked out the
tongue positions by matching against recordings of 76 people made in 1952 — and the program that
did the matching independently arrived at the same tongue positions that speech scientists
describe, without being told about any of them. It put the tongue where it goes because that is
where the air requires it to be.

Ten vowels out of ten, close enough. The physics did the work.

The consonants did not come free. They are still not free.

---

## Then I recorded myself, and made it worse

I recorded my own voice — a full set of sounds, a word list, and a real goal cry — and fitted the
model to me.

**The version fitted to my actual voice was worse than the generic one.**

It took a long time to work out why. The fit decided my vocal tract was about 16 cm long, while
also deciding my voice was very deep. Every other voice in the collection sits on a sensible
line: a longer tube goes with a bigger voice box goes with a deeper voice. A person built like a
smaller adult, with the voice box of a larger one, doesn't exist — and it sounded like it didn't.

The most carefully measured thing in the whole project was the least trustworthy.

---

## The clicking

At some point a clicking noise appeared and would not go away.

I built five different ways of measuring it. All five measured something else. One of them was
carefully counting the vocal cords slapping shut — which happens about ninety times a second in a
normal voice and is not a defect, it is *where all the sound comes from*. I had built an
instrument that flagged the voice itself as the problem.

Then this arrived in a message:

> *the pops remind me of a Kalahari bushman more than an artifact — so maybe they're physical?*

They were. A click, the kind used as a consonant in some southern African languages, is made by
sealing off part of your mouth and letting go under pressure. And that is exactly what the model
was doing: **every "m" and "n" in the language was letting go with a small bang.**

Making an "m" seals your lips. So does making a "b". The code that worked out "is the mouth
sealed" couldn't tell the two apart — so it built up pressure behind every "m" and released it.
The correct physics was written down a hundred lines earlier in the same file, in a note,
correctly, and applied to something else.

A while later, another one:

> *"I lovemy daughter" removes the pop*

Deleting one space, two words earlier, fixed a click. That made no sense for about ten minutes,
and then made complete sense. At the end of a sliding vowel — the *i* in "ride", where your
tongue starts one place and ends another — the model was asking "where was the tongue?" and being
told **where it started** instead of where it finished. So at every word boundary after one of
those, the tongue jumped the width of the mouth instantly.

---

## Which raised a better question

Could a real tongue move the way this one was moving?

Not remotely. The model could take the tongue from one extreme to the other in about the time it
takes to blink, forty times over. A real tongue is a lump of muscle and needs roughly ten times
longer.

So we gave everything weight. The tongue, the jaw and the lips now have to be *pushed* into
position, and pushing takes time.

Something appeared that nobody wrote:

**When there isn't enough time, the tongue doesn't get there.**

It sets off, gets most of the way, and the next sound starts anyway. That is not a flaw in human
speech — it is most of what makes talking sound like *talking* rather than a list of sounds. It's
why "did you eat" comes out "djeet". We got it free, because anything with weight, asked to move
further than it can, falls short.

The first attempt broke every hard consonant, because a "d" that doesn't quite close isn't a
softer "d", it's a different sound entirely. The fix came from anatomy again: **your tongue
doesn't aim at the roof of your mouth. It aims past it, and the roof stops it.** Once the model
did the same, the consonants closed properly and the vowels kept their softness.

---

## What it keeps coming back to

Every real fix has been the same fix, wearing different clothes:

**make it do what a throat can actually do.**

The clicking was pressure released where no pressure should have built. The jumping tongue was a
movement no muscle could make. The soft consonants were a tongue that stopped politely at the
roof of the mouth instead of pressing into it. The voice that didn't sound like me was a body
that couldn't exist.

And the other thing, which I did not expect:

**The ear beat the instruments, every single time.**

I was confidently wrong about the clicking five times running, with numbers to back it up. Every
diagnosis that turned out to be right came from someone listening and saying something
unscientific — *ghost, sasquatch, moo, an Asian saying "l", a lispy w, a static blast followed by
a plucked guitar string.*

That last one described, precisely, a burst of noise setting off a resonance that then rings away
with nothing to sustain it. Which is what it was.

And the mistakes that fooled me longest were never the obvious failures. They were the
measurements that looked completely fine. A tool that quietly returned nothing at all for larger
voices. A saved result that made five different experiments give the same answer — where the only
clue was that the numbers were *identical*, which real measurements never are.

The bugs were the easy part. Knowing whether I'd actually fixed one was the hard part.

---

## Six days

The football simulator was created on a Thursday. The throat was working the following Wednesday.

The vocal tract itself — the tube, the tongue, the vowels, the voices, the test bench, the
clicking, the weight — is **two and a half days and about two hundred commits.**

Two things are worth separating out of that, because they are not the same claim.

**What compressed was the loop, not the thinking.** Try something, measure it, find out it was
wrong, try again — that cycle ran hundreds of times in a few days, where it used to be the thing
that made a project like this take a year. Nobody had to hand-write an analysis tool and then
debug the tool.

**What did not compress was knowing what to fix.** Every single real diagnosis came from a person
listening and describing what they heard. Not one came from the measurements. The instruments
were wrong about the clicking five times running, and the answer, when it came, was *"that sounds
like a Kalahari bushman, maybe it's physical."*

So the honest version is not "AI built a vocal tract in a weekend". It is closer to: **the part
that needed a human took exactly as long as it always would have, and everything around it got
out of the way.**

There is a small joke in here that I am obliged to report. The first draft of this document said
the project had taken **nine months.** I made the number up, and nobody checked it, and it went
into the file — in a document whose entire argument is *check your measurements.* Off by a factor
of forty. The correction came, as usual, from the person who was actually there.

---

## Where it is

It still can't say "j". *Jump* comes out as *doo-ump*, and fixing it is real work.

But it can say *hello world* in something that sounds like a person, built out of nothing but a
tube, a tongue, and a description of how air behaves. And when it shouts GOOOOAAALLL it's a
different shout every time.

Which is the thing we wanted in the first place.
