// PUNCTUATION HAS TO STAND CLEAR OF THE WORD GAPS, and it stopped doing so the moment those
// became variable. A word gap now runs 32 to 135 ms around a median of 49. A comma was 107 and a
// full stop 194 — so a comma sat INSIDE the word-gap range and a sentence boundary was barely
// outside it. Reported as "Call me Ishmael" having no pause after the name: it had one, of
// 194 ms, which is not a pause when an ordinary word boundary can be 117.
check("a pause is longer than a word gap", () => {
  const P = H.P, S = require("../../engine/spelling.js"), bad = [];
  const v = { ...P.defaultVoice(), ...P.VOICES.john.v };
  const t = "Call me Ishmael. Some years ago, never mind how long precisely, I thought I would sail about a little.";
  const r = S.g2p(t);
  const D = Math.max(0.35, P.phraseTime(r.ph.length, v.per));
  const W = P.buildWord(r.ph, { D, rate: P.rateFor(r.ph, D, v), n: Math.round(v.sect),
                                stress: r.stress, pros: v, glide: v.glide,
                                stopHold: v.stopT, drawl: v.drawl });
  const words = [], comma = [], stop = [];
  for (const sg of W.seg) {
    const s = String(sg.sym), ms = 1000 * (sg.b - sg.a);
    if (s === " ") words.push(ms);
    else if (s === "brk,") comma.push(ms);
    else if (s === "brk." || s === "brk?") stop.push(ms);
  }
  if (!words.length || !comma.length || !stop.length)
    return { ok: false, note: "the test line lost its gaps or its punctuation" };
  const longestWord = Math.max(...words);
  const shortestComma = Math.min(...comma), shortestStop = Math.min(...stop);
  // half again as long as the longest word gap, or it is not heard as a pause
  if (shortestComma < longestWord * 1.5)
    bad.push(`a comma is ${shortestComma.toFixed(0)} ms against a word gap of up to ${longestWord.toFixed(0)}`);
  if (shortestStop < shortestComma * 1.5)
    bad.push(`a full stop is ${shortestStop.toFixed(0)} ms, not clearly longer than a comma`);

  return { ok: bad.length === 0,
           note: bad.join("  ") ||
                 `word gaps to ${longestWord.toFixed(0)} ms, comma ${shortestComma.toFixed(0)}, ` +
                 `full stop ${shortestStop.toFixed(0)}` };
});

// Two systematic spelling faults, both found in one line of Frost.
check("a before ll, and er before a vowel", () => {
  const S = require("../../engine/spelling.js"), bad = [];
  const WANT = {
    // `a` before a doubled l is /ɔ/. Only "wall" and "walk" were right, and by accident — the
    // `wa` rule happened to catch them.
    all: "ɔl", call: "kɔl", ball: "bɔl", tall: "tɔl", fall: "fɔl", small: "smɔl", hall: "hɔl",
    salt: "sɔlt", talk: "tɔlk", walk: "wɔlk",
    // before a VOWEL it stays /æ/, so the test is on what follows the l
    shallow: "ʃæloʊ",
    // `er` before a vowel is two sounds, not the single /ɝ/
    every: "ɛvəri", several: "sɛvərəl", camera: "kæmərə", difference: "dɪfərəns",
    // and /ɝ/ is right when the r CLOSES the syllable — these must not move
    her: "hɝ", term: "tɝm", serve: "sɝv", memory: "mɛməri",
  };
  for (const [w, want] of Object.entries(WANT)) {
    const got = S.g2p(w).ph.join("");
    if (got !== want) bad.push(`${w} /${got}/ want /${want}/`);
  }
  return { ok: bad.length === 0,
           note: bad.slice(0,4).join("  ") || `${Object.keys(WANT).length} words` };
});
