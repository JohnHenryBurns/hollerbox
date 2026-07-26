# Reference recordings

A person reading the bench phrases, for comparing the model's timing against a real one.

## john-phrases.m4a

The twelve phrases from `lab/bench.html`, read once, 30.7 s. Segmented by short-time energy
into thirteen utterances — one phrase gets split by an internal pause, which is why there are
thirteen and not twelve.

Durations, in milliseconds:

    700  1080  960  1480  1820  1440  600  1300  1240  1340  1240  1260  2700

The longest is unambiguously "the quick brown fox jumps over the lazy dog" and the shortest
"Hello World"; the middle eleven are in bench order.

**What it is for.** Until this existed there was no way to answer "is the model too slow" except
by asking someone, and "too slow" turned out to mean something more specific than it sounded:
the model makes every utterance about the same length whatever is in it. Spoken phrases here
span 700 to 2700 ms. The model's span 2180 to 3205.

**How it was measured.** 40 ms windows, 20 ms hops, threshold at 3.5% of peak energy, gaps under
350 ms joined and bursts under 250 ms dropped. That is a crude segmenter and it is good enough
for utterance boundaries; it is not good enough for phoneme boundaries, which is the next thing
this recording could give if it were aligned properly.
