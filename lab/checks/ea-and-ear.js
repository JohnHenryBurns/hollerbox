// Three faults in one line, each broader than the word that exposed it. Found by listening to
// "In the beginning, God created the heavens and the earth" — which is now an opening phrase, so
// it is the first thing many people will ever hear this say.
check("ea, ear, and a dictionary word that is inflected", () => {
  const S = require("../../engine/spelling.js"), bad = [];
  const WANT = {
    // `ear` before a consonant is /ɝ/, not /ir/
    earth: "ɝθ", early: "ɝli", learn: "lɝn", search: "sɝt͡ʃ", heard: "hɝd",
    // and before a vowel or at the end it stays /ir/, which is why the test is on what follows
    ear: "ir", hear: "hir", near: "nir", year: "jir",
    // `ea` before a v is /ɛ/
    heaven: "hɛvən", heavens: "hɛvənz", heavy: "hɛvi",
    // the short-/ɛ/ words that already worked, and the plain /i/ ones, must not move
    head: "hɛd", bread: "brɛd", eat: "it", sea: "si", each: "it͡ʃ",
    // `ea` that is two syllables — no rule can see this, so it is a dictionary word
    create: "krieɪt", creating: "krieɪtɪŋ",
  };
  for (const [w, want] of Object.entries(WANT)) {
    const got = S.g2p(w).ph.join("");
    if (got !== want && got !== want.replace("t͡ʃ", "tʃ")) bad.push(`${w} /${got}/ want /${want}/`);
  }

  // A DICTIONARY WORD MUST KEEP ITS DICTIONARY FORM WHEN INFLECTED. The dictionary was consulted
  // once, on the whole word, BEFORE the inflection came off — so `create` was known and
  // `created` was not, and every irregular word in it lost its plural and its past tense to the
  // letter rules. This is the general case, not the one word that showed it.
  for (const [w, want] of [["created","krieɪtɪd"], ["gives","gɪvz"], ["begins","bɪgɪnz"]]) {
    const r = S.g2p(w);
    if (r.ph.join("") !== want) bad.push(`${w} /${r.ph.join("")}/ want /${want}/`);
    if (r.from === "rules") bad.push(`${w} fell through to the letter rules instead of the dictionary`);
  }

  return { ok: bad.length === 0,
           note: bad.slice(0,4).join("  ") ||
                 `${Object.keys(WANT).length} words, and the dictionary survives inflection` };
});
