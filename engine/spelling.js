// ─────────────────────────────────────────────────────────────────────────────
// THE SPELLER. One copy, in a file.
//
// Grapheme-to-phoneme rules, the built-in dictionary, and the personal dictionary on top of
// it. This lived in index.html, and the gate reached it by rebuilding the function out of the
// page with six regular expressions and a fake localStorage — including one that depended on
// `const PAUSE=` being immediately followed by `function g2pWord`, so reordering two unrelated
// declarations would have broken the speller check while looking like a speller regression.
//
// The personal dictionary is browser state, so storage is INJECTED rather than reached for.
// That is the same change that made buildWord shareable: a module that reaches for a global
// can only run where that global exists.
//
//   browser   <script src="engine/spelling.js"></script>
//             HOLLER_SPELL.useStorage(localStorage)     // opt in to the personal dictionary
//   node      const S = require("./engine/spelling.js")
//             // no storage: BUILTIN_DICT only, which is what the gate wants
// ─────────────────────────────────────────────────────────────────────────────
(function (root) {
'use strict';

// No storage until someone supplies it. The gate runs with this default and therefore tests
// the shipped dictionary, not whatever happens to be in a browser.
let STORE = { getItem: () => null, setItem: () => {} };
function useStorage(s){ if (s && s.getItem && s.setItem) STORE = s; }

const G2P_RULES = [
  // longest patterns first
  [/^tion/,      ['ʃ','ə','n']],
  [/^sion/,      ['ʃ','ə','n']],
  [/^ought/,     ['ɔ','t']],
  // "augh" is two different vowels and NOTHING in the spelling says which: "daughter" is
  // /dɔtɝ/ and "laughter" is /læftɝ/. The rule used to be /æf/ unconditionally, so daughter
  // came out d-æ-f-t-ɝ and "taught" came out "taft". Before a /t/ the majority is /ɔ/ —
  // taught, caught, naught, fraught, naughty, slaughter, onslaught, daughter — so that is
  // the rule, and the /æf/ side of it is a closed set of five words that goes in the
  // dictionary where lexical facts belong. Longest pattern first, so this must precede
  // the bare "augh" that still serves "laugh" and "laughing".
  [/^aught/,     ['ɔ','t']],
  [/^augh/,      ['æ','f']],
  [/^igh/,       ['aɪ']],
  [/^tch/,       ['t','ʃ']],
  [/^dge/,       ['d','ʒ']],
  [/^ch/,        ['t','ʃ']],
  [/^sh/,        ['ʃ']],
  [/^ph/,        ['f']],
  [/^th/,        ['θ']],          // voiceless by default; "the/this/that" are in the dictionary
  [/^wh/,        ['w']],
  [/^ck/,        ['k']],
  [/^ng/,        ['ŋ']],
  [/^qu/,        ['k','w']],
  [/^x/,         ['k','s']],
  [/^eo/,        ['i']],         // people
  [/^wa(?=[^aeiouy])/, ['w','ɔ']], // water, want, wash, watch
  [/^ee/,        ['i']],
  // `ear` before a consonant is /ɝ/, not /ir/: earth, early, earn, learn, search, heard, pearl.
  // Before a vowel or at the end it stays /ir/ — ear, hear, near, clear, year — which is why the
  // test is on what FOLLOWS. "Beard" and "weary" are the counterexamples and they are rarer than
  // the words this gets right.
  [/^ear(?=[^aeiouy])/, ['ɝ'], null, 3],
  // `ea` before a v is /ɛ/: heaven, heavy, leaven. The short-/ɛ/ rule already covered head,
  // bread, dead and breath, and stopped at the consonant it happened to be written for.
  [/^ea(?=v)/,   ['ɛ']],
  [/^ea/,        ['i']],
  // `a` before a doubled l is /ɔ/: all, ball, call, fall, hall, small, tall. Only "wall" and
  // "walk" were right, and by accident — the `wa` rule above happened to catch them.
  // Before a VOWEL it stays /æ/: shallow, tallow, callous. So the test is on what follows the l.
  [/^a(?=ll($|[^aeiouy]))/, ['ɔ']],
  // and `al` before another consonant: salt, talk, walk, chalk, calm
  [/^a(?=l[kmt])/, ['ɔ']],
  // `i` before `nd` is /aɪ/: mind, kind, find, bind, blind, grind, behind. Every one was /ɪ/,
  // which is why "mind" was heard as something like "mailed" — /mɪnd/ against /maɪnd/.
  // Only at the end of a word or before another consonant, so "window" and "indeed" are safe.
  [/^i(?=nd($|[^aeiouy]))/, ['aɪ']],
  // `o` before `ng` is /ɔ/: long, song, strong, wrong, among.
  [/^o(?=ng)/,   ['ɔ']],
  // `er` before a VOWEL is two sounds, /ər/, not the single /ɝ/: every, several, general,
  // camera, difference. /ɝ/ is right when the r closes the syllable — her, term, serve — and
  // wrong when it opens the next one, which is what a following vowel means.
  [/^er(?=[aeiouy])/, ['ə','r'], null, 2],
  [/^ie/,        ['i']],
  [/^oo/,        ['u']],
  [/^ow$/,       ['oʊ']],       // yellow, window, show — final -ow is not the -ow of "down"
  [/^ou/,        ['aʊ']],
  [/^ow/,        ['aʊ']],
  [/^oa/,        ['oʊ']],
  [/^oe/,        ['o']],
  [/^ai/,        ['eɪ']],
  [/^ay/,        ['eɪ']],
  [/^ei/,        ['eɪ']],
  [/^ey/,        ['eɪ']],
  [/^oi/,        ['ɔɪ']],
  [/^oy/,        ['ɔɪ']],
  [/^au/,        ['ɔ']],
  [/^aw/,        ['ɔ']],
  [/^ar/,        ['ɑ','r']],
  [/^or/,        ['ɔ','r']],
  [/^er/,        ['ɝ']],
  [/^ir/,        ['ɝ']],
  [/^ur/,        ['ɝ']],
  // `-le` is a syllable of its own — little, table, apple — only after a CONSONANT. After a
  // vowel it is the magic e doing its job and the l is just an l: hole, pole, mole, whole came
  // out /hoʊəl/, with a schwa English does not put there. The lookbehind is what the rule always
  // meant; it simply had no way to say so from the front of the string.
  [/^le$/,       ['ə','l'], /^[^iɪɛæɑɔʊuʌɝəo]/],   // after a consonant SOUND: little, table
  // magic e: a single consonant then a final e lengthens the vowel
  [/^a(?=[^aeiou]e$)/, ['eɪ']],
  [/^i(?=[^aeiou]e$)/, ['aɪ']],
  // /oʊ/, not a bare /o/. Every other magic-e vowel in this table produces what English
  // actually has — a gives eɪ, i gives aɪ — and o alone gave a monophthong the language does not
  // use in this position. The rule four lines down, for go and no and hello, had it right the
  // whole time. So note, hole, rose, stone and every regular past tense built on one of them
  // came out with a vowel no English speaker makes.
  [/^o(?=[^aeiou]e$)/, ['oʊ']],
  // `-ose` and `-ise` after a magic e are /z/, not /s/: rose, nose, chose, close, wise, rise.
  // `-ase` and `-use` are not — case, base, goose — so this is deliberately the two endings and
  // not a general rule about s between vowels. The final-s assimilation further down handles
  // s after a CONSONANT and says in its own comment that it stays out of this case; here the
  // spelling does predict something, but only for these two.
  [/^se$/,       ['z'], /^(oʊ|aɪ)$/],
  [/^u(?=[^aeiou]e$)/, ['u']],
  [/^e(?=[^aeiou]e$)/, ['i']],
  // soft c and g
  [/^c(?=[eiy])/, ['s']],
  [/^g(?=[eiy])/, ['d','ʒ']],
  [/^c/,         ['k']],
  // y
  [/^y(?=[aeiou])/, ['j']],
  [/^y$/,        ['i']],
  [/^y/,         ['ɪ']],
  [/^o$/,        ['oʊ']],       // go, no, hello, potato
  // a final silent e
  [/^e$/,        []],
  // plain letters
  [/^a/, ['æ']], [/^e/, ['ɛ']], [/^i/, ['ɪ']], [/^o/, ['ɑ']], [/^u/, ['ʌ']],
  [/^b/, ['b']], [/^d/, ['d']], [/^f/, ['f']], [/^g/, ['g']], [/^h/, ['h']],
  [/^j/, ['d','ʒ']], [/^k/, ['k']], [/^l/, ['l']], [/^m/, ['m']], [/^n/, ['n']],
  [/^p/, ['p']], [/^r/, ['r']], [/^s/, ['s']], [/^t/, ['t']], [/^v/, ['v']],
  [/^w/, ['w']], [/^z/, ['z']],
];

// ─── PHASE 8.0: SYLLABLES AND STRESS ─────────────────────────────────────────
// Nothing below changes a single sound. It adds a channel.
//
// Duration, per-segment amplitude, accent placement and vowel reduction all need to know
// which syllable is stressed, and none of them can be built until something says so. This
// says so. It is ADDED to the return value rather than replacing it: `{ph, from}` is
// untouched, `syl` and `stress` are new keys, so every existing consumer keeps working
// without being edited. That is deliberate — a step that both adds a channel and changes the
// existing one cannot be bisected when it goes wrong.

const NUCLEI = new Set(['i','ɪ','ɛ','æ','ʌ','ɑ','ɔ','ʊ','u','ɝ','ə','o',
                        'aɪ','aʊ','ɔɪ','eɪ','oʊ']);

// Which consonant clusters English allows at the START of a syllable. This is the whole of
// the maximum-onset principle: given a run of consonants between two vowels, as many as can
// legally begin a syllable go to the RIGHT one, and the remainder is the left one's coda.
// So "atlas" splits æt·ləs, because /tl/ cannot start an English syllable, while "better"
// splits bɛ·tɝ, because /t/ can.
function legalOnset(c){
  if(c.length===0) return true;
  if(c.length===1) return c[0]!=='ŋ';              // /ŋ/ never begins a syllable
  if(c.length===2){
    const a=c[0], b=c[1];
    // This inventory spells the affricates as two symbols, so /tʃ/ arrives here as t+ʃ.
    // Without these two lines "kitchen" would split kɪtʃ·ən instead of kɪ·tʃən.
    if(a==='t'&&b==='ʃ') return true;
    if(a==='d'&&b==='ʒ') return true;
    if(a==='s'&&'ptkfmnlwj'.includes(b)) return true;
    if('pbtdkgfvθʃ'.includes(a)&&b==='r') return true;
    if('pbkgfs'.includes(a)&&b==='l') return true;
    if('ptkbdgmnfvhs'.includes(a)&&b==='j') return true;   // the /j/ of music, few, cute
    if('tdkgsθ'.includes(a)&&b==='w') return true;
    return false;
  }
  // Three is the English maximum and it is always s + voiceless stop + liquid or glide:
  // splash, spring, street, scream, square.
  if(c.length===3) return c[0]==='s' && 'ptk'.includes(c[1]) && legalOnset(c.slice(1));
  return false;
}

// Split a phone string into syllables. Returns [] for a word with no vowel in it, which is a
// real case ("hmm", "shh") and must not throw.
function syllabify(ph){
  const nuc=[];
  for(let i=0;i<ph.length;i++) if(NUCLEI.has(ph[i])) nuc.push(i);
  if(!nuc.length) return [];
  const syl=[];
  for(let s=0;s<nuc.length;s++){
    const here=nuc[s];
    const on = s===0 ? ph.slice(0,here)                    // whatever begins the word
                     : null;                               // filled in by the split below
    syl.push({on:on||[], nuc:ph[here], cod:[], i:here});
  }
  for(let s=0;s<nuc.length;s++){
    const here=nuc[s];
    if(s===nuc.length-1){ syl[s].cod=ph.slice(here+1); break; }   // the rest of the word
    const run=ph.slice(here+1, nuc[s+1]);
    // Longest legal onset wins — that is the maximal onset principle, stated directly.
    let k=Math.min(3,run.length);
    while(k>0 && !legalOnset(run.slice(run.length-k))) k--;
    syl[s].cod   = run.slice(0, run.length-k);
    syl[s+1].on  = run.slice(run.length-k);
  }
  return syl;
}

// ---- where the stress goes ----
// English stress is lexical: it is a property of the word, not derivable from it. What IS
// derivable is the large patterned subset, because a handful of suffixes reliably pull stress
// to a fixed distance from the end of the word regardless of what the rest of it is.
const STRESS_FINAL   = /(ee|eer|ese|ette|esque|oon)$/;              // employee, cartoon
const STRESS_ANTEPEN = /(ity|ify|ical|logy|graphy|ometer|itive|ible|ular)$/;  // possiBILity
const STRESS_PENULT  = /(tion|sion|ic|ial|ian|ious|eous|uous|cial|tial)$/;    // creAtion
// The heuristic will be wrong, and where it is wrong the honest fix is a list rather than a
// cleverer rule. A real system carries stress in the lexicon; this is the small end of that.
// WEAK_FIRST is NOT reused here, deliberately, and the smoke test is why. It matches "a" in
// *atlas* and "be" in *better*, so driving stress from it gives at-LAS and be-TTER. It is too
// loose because it only requires three more letters, and it is too loose in the SAME way for
// its original job — "better" already spells to b-ə-t-ɝ today, which is a pre-existing bug
// filed under Open faults, not one to fix inside a step that promises to change no sounds.
//
// The regularity it is missing: an unstressed first syllable is open, so the prefix is
// followed by a consonant and then a VOWEL. a-bout, a-gain, a-rena, be-cause, to-gether,
// com-puter. Where the next two letters are two consonants, the first syllable is closed and
// therefore stressed: at-las, ap-ple, ac-tor, an-gry, bet-ter, red-dish. One lookahead.
//
// The Latin prefixes end in a consonant themselves, so they satisfy this unchanged, and they
// are left out of the alternation anyway: "at" and "ac" would let the regex backtrack out of
// a blocked "a" and match after all, which is how atlas slipped through the first version.
const WEAK_STRESS = /^(a|be|de|re|to|pro|com|con|sub|sur|per)(?=[^aeiouy][aeiouy])/;
const STRESS_DICT = {
  banana:1, potato:1, tomato:1, hello:1, guitar:1, about:1, machine:1,
  police:1, hotel:1, umbrella:1, spaghetti:1, vanilla:1, gorilla:1,
  tornado:1, volcano:1, piano:1, arena:1, agenda:1, solana:1, orion:1,
};
function stressIndex(word, nsyl){
  if(nsyl<=1) return 0;
  const w=String(word||'').toLowerCase().replace(/[^a-z]/g,'');
  if(STRESS_DICT[w]!==undefined) return Math.min(STRESS_DICT[w], nsyl-1);
  const clamp=i=>Math.max(0,Math.min(nsyl-1,i));
  if(STRESS_FINAL.test(w))   return clamp(nsyl-1);
  // Antepenultimate before penultimate: "logical" ends in -ical, and testing -ic first would
  // never fire on it, but the ordering costs nothing and the reverse would be a silent trap.
  if(STRESS_ANTEPEN.test(w)) return clamp(nsyl-3);
  if(STRESS_PENULT.test(w))  return clamp(nsyl-2);
  if(WEAK_STRESS.test(w))    return clamp(1);
  return 0;                                    // English defaults to initial stress
}

// One entry per phone, carrying the stress level of the syllable it belongs to.
// Parallel to `ph` so a consumer can index straight across without re-deriving anything.
// 1 = primary, 0 = unstressed. Secondary stress is not modelled yet.
function markStress(word, ph){
  const syl=syllabify(ph);
  const stress=new Array(ph.length).fill(0);
  if(!syl.length) return {syl, stress, primary:-1};
  const primary=stressIndex(word, syl.length);
  syl.forEach((s,i)=>{ s.stress = i===primary?1:0; });
  // Walk the phones back onto their syllables. Every phone belongs to exactly one, because
  // syllabify partitions the string — onsets, nuclei and codas together cover it with no gap.
  let at=0;
  syl.forEach(s=>{
    const len=s.on.length+1+s.cod.length;
    for(let i=at;i<at+len && i<ph.length;i++) stress[i]=s.stress;
    at+=len;
  });
  return {syl, stress, primary};
}

// ---- whole-word shapes ----
// G2P_RULES only ever match a SUFFIX of the word: by the time `^y$` or `^e$` fires, everything
// before it has been consumed and the rule cannot see whether the word had any other vowel.
// Two very common English patterns depend on exactly that, so they are decided up front.
const WORD_SHAPE = [
  // A final -y is /aɪ/ when it is the word's only vowel and /i/ otherwise: my, by, why, try,
  // fly, cry, sky, shy against happy, city, funny, lazy. Same letter, two sounds, and what
  // decides is what came before it. "my" was coming out as /mi/.
  [/^[^aeiouy]+y$/, 'aɪ'],
  // A final -e is silent when something else carries the vowel — make, wife, love — but when
  // it is the ONLY vowel it IS the vowel. The silent-e rule was firing on those and returning
  // a bare consonant with no vowel at all: "she" spelled to /ʃ/, "be" to /b/. Five of the
  // hundred commonest words in English, each of them silent.
  // y is excluded from the class so "style" and "rhyme" keep their own vowel.
  [/^[^aeiouy]+e$/, 'i'],
];

const PAUSE=' ';                    // a word boundary in the sound chain

// PUNCTUATION HAS TO SURVIVE THIS FILE. Every word went through
// `.replace(/[^a-z]/g,'')`, so a comma and a space were the same thing by the time anything
// downstream saw them — and a phrase boundary IS punctuation. That is what blocks 8.4 step 4:
// the pitch baseline falls across an utterance correctly and has nothing to reset at. It is
// also what blocks the terminal contour, since a question and a statement differ by a mark
// that never arrived.
//
// These ride in the chain beside the phonemes, the way PAUSE already does. Everything that
// asks "is this a pause" says yes to them; what changes is how long they are and, later, what
// the pitch does across them.
// FIVE LENGTHS, NOT TWO. Everything that was not a comma was a full stop, and three real marks
// were being flattened into those: an ellipsis read as a full stop, an em dash produced no break
// at all, and a semicolon and colon were commas.
//
// The dramatic pause after "Call me Ishmael" is a performance choice and nothing in that sentence
// asks for it — but English already has marks that DO ask for it, and text pasted out of a book
// carries them. An ellipsis means a trailing silence and an em dash means an interruption. So
// there is no need to invent a convention like a doubled full stop: honouring the ones readers
// already use gets the same result and works on text nobody wrote for this program.
//
//   brk;   between a comma and a full stop     semicolon, colon
//   brk…   longer than a full stop             ellipsis, em dash, double dash
const BREAKS = { ',': 'brk,', ';': 'brk;', ':': 'brk;',
                 '.': 'brk.', '!': 'brk.',
                 '?': 'brk?',
                 '…': 'brk…', '—': 'brk…', '–': 'brk…' };
const isBreak = sym => typeof sym === 'string' && sym.slice(0,3) === 'brk';
/** The mark ending a word, if any — the last one, so "what?!" is a question. */
function breakAfter(word){
  const w = String(word||'');
  // The dramatic marks are tested first and separately, because they are the LONGEST and an
  // ellipsis is made of the same character as a full stop — checking "does it contain a dot"
  // first would read every ellipsis as a full stop, which is what used to happen.
  if(/(\.\.\.|…|—|–|--)$/.test(w)) return BREAKS['…'];
  const m = w.match(/[,;:.!?]+$/);
  if(!m) return null;
  const marks = m[0];
  if(marks.includes('?')) return BREAKS['?'];
  if(marks.includes('.') || marks.includes('!')) return BREAKS['.'];
  return BREAKS[marks[marks.length-1]] || null;
}
function g2p(phrase){
  // A space is a word boundary. Each word is looked up on its own, then joined by a pause.
  const words=String(phrase||'').trim().split(/\s+/).filter(Boolean);
  if(words.length>1){
    const out=[], st=[], syl=[]; let from='rules', prevBreak=null;
    words.forEach((w,i)=>{
      const r=g2pWord(w);
      if(r.from==='remembered'||r.from==='built in') from=r.from;
      // the break belonging to the PREVIOUS word replaces the plain boundary, so "one. two"
      // gets a full stop between them rather than a word gap
      if(i){ out.push(prevBreak || PAUSE); st.push(0); }
      out.push(...r.ph);
      st.push(...r.stress);
      syl.push(...r.syl);
      prevBreak = breakAfter(w);
    });
    // and a mark on the last word is a real boundary too — it is what ends the utterance
    if(prevBreak){ out.push(prevBreak); st.push(0); }
    return {ph:out, from: words.length+' words', stress:st, syl};
  }
  const one = g2pWord(words[0]||'');
  const b = breakAfter(words[0]||'');
  if(b) return {...one, ph:[...one.ph, b], stress:[...(one.stress||[]), 0]};
  return one;
}
// English reduces unstressed vowels to schwa, and rules cannot see stress. But the weak
// first syllable is highly patterned: a-bout, a-gain, be-cause, com-puter, to-gether. Catching
// those prefixes fixes most of it without needing a stress model.
const WEAK_FIRST=/^(a|be|com|con|de|re|to|pro|per|sur|sup|suc|o[bcf]|ac|ad|al|as|at|ef|em|en|ex|im|in|ob|oc|op|pre|sub)(?=[a-z]{3,})/;
// Attach the syllable and stress channel to a speller result. One place, so the dictionary
// path and the rules path cannot drift — which is the same mistake buildWord's near-copy in
// the harness was, and it is worth not making twice.
// ── AN UNSTRESSED VOWEL IS A SCHWA ────────────────────────────────────────
// The largest single rule in English vowel quality, and it was not being applied. The stress
// marking was already correct — every vowel that should reduce was already marked unstressed —
// so "travelled" came out /trævɛld/, "ago" /ægoʊ/, "family" /fæmɪli/, "sofa" /sɑfæ/. Reading a
// passage aloud is what made it obvious; single words hide it.
//
// Three exceptions, all real:
//
//   Diphthongs do not reduce. "Tomato" ends in an unstressed /oʊ/ and keeps it, which is why
//   the rule cannot simply be "unstressed becomes schwa".
//
//   A word-final /i/ does not reduce — the <y> of "family", "happy", "city". English lost that
//   reduction centuries ago and the vowel is now a full one.
//
//   /ɝ/ does not reduce, because it already IS a reduced vowel: schwa with an r on it. Sending
//   it to schwa would delete the r.
const VOWELS = new Set(['i','ɪ','ɛ','æ','ɑ','ɔ','ʊ','u','ʌ','ɝ','ə','o']);
const DIPH_SET = new Set(['aɪ','aʊ','ɔɪ','eɪ','oʊ']);
function reduceUnstressed(ph, stress){
  if(!stress || stress.length !== ph.length) return ph;
  const out = ph.slice();
  // the last vowel in the word, for the final-/i/ exception
  let lastV = -1;
  for(let i=0;i<out.length;i++) if(VOWELS.has(out[i]) || DIPH_SET.has(out[i])) lastV = i;
  for(let i=0;i<out.length;i++){
    if(stress[i] !== 0) continue;                 // stressed, or not a syllable at all
    const p = out[i];
    if(!VOWELS.has(p)) continue;                  // consonants and diphthongs alike
    if(p === 'ə' || p === 'ɝ') continue;          // already reduced
    if(i === lastV && p === 'i') continue;        // family, happy, city
    // An unstressed /ɪ/ resists reduction in a CLOSED syllable and gives way in an open one:
    // "cabin" is /kæbɪn/ and "rabbit" /ræbɪt/, while "family" is /fæməli/ — all three spelled
    // with an <i>, so this cannot be decided from the letter. Closed here means the vowel is
    // followed by a consonant that either ends the word or is itself followed by another.
    if(p === 'ɪ'){
      const nx = out[i+1], nx2 = out[i+2];
      const closed = nx && !VOWELS.has(nx) && !DIPH_SET.has(nx) &&
                     (nx2 === undefined || (!VOWELS.has(nx2) && !DIPH_SET.has(nx2)));
      if(closed) continue;
    }
    out[i] = 'ə';
  }
  return out;
}

function withStress(word, res){
  const m=markStress(word, res.ph);
  // A DICTIONARY ENTRY IS NOT REDUCED. Reduction is a rule for words spelled out by rules; a
  // word somebody wrote the pronunciation of has already had every decision made about it.
  // Applying both turned "beginning" into /bəgɪnɪŋ/ where the entry says /bɪgɪnɪŋ/, and
  // "forget" into /fɔrgət/ where it says /fɔrgɛt/ — the rule quietly overruling the exception
  // that exists BECAUSE the rules are wrong there.
  const ph = res.from === 'rules' ? reduceUnstressed(res.ph, m.stress) : res.ph;
  return {...res, ph, syl:m.syl, stress:m.stress, primary:m.primary};
}
function g2pWord(word){
  let w=String(word||'').toLowerCase().replace(/[^a-z]/g,'');
  const spelling=w;                    // w is consumed by the rule loop below; stress needs it
  const dict=loadDict();
  if(dict[w]) return withStress(spelling, {ph:dict[w].slice(), from: BUILTIN_DICT[w]?'built in':'remembered'});
  const out=[];
  let guard=0;
  // ---- THE TWO COMMONEST INFLECTIONS IN ENGLISH, BOTH OF WHICH WERE WRONG ----
  //
  // Regular past tense and regular plural are the two endings that appear in almost every
  // sentence, and the letter-by-letter rules spelled both as though the vowel were pronounced:
  // "travelled" came out /trævɛlɛd/, "diverged" as /dɪvɝdʒɛd/, "times" as /tɪmɛs/.
  //
  // Both endings are governed by the sound BEFORE them, and the rule is the same shape in each
  // case — a vowel appears only when the stem already ends in the ending's own consonant,
  // because otherwise it would be unpronounceable:
  //
  //   -ed   after /t d/                 -> ɪd      wanted, needed
  //         after a voiceless consonant -> t       walked, kissed
  //         otherwise                   -> d       played, travelled
  //
  //   -s    after a sibilant            -> ɪz      buses, wishes, ages
  //         after a voiceless consonant -> s       cats, books
  //         otherwise                   -> z       dogs, times, dreams
  //
  // Done here, before the shape rules, so the stem is spelled on its own and the ending is
  // decided from the stem's LAST SOUND rather than its last letter. The distinction matters:
  // "diverged" ends in the letter e but the sound /dʒ/.
  let inflect=null;
  // ── `-ly` COMES OFF FIRST ────────────────────────────────────────────────
  // It is not an inflection in the -ed/-s sense — it makes an adverb, and its sound is always
  // the same two — but it has to be stripped for the same reason: it puts a consonant after a
  // magic e and the magic e stops working. "Precisely" came out /prəsəsəli/ where the stem
  // "precise" is /prəsaɪz/, and every -ly adverb built on a magic-e stem was wrong the same way:
  // nicely, widely, closely, likely, politely, completely, rudely. The stems were all correct.
  //
  // Handled here rather than as a rule, because the rules read a suffix at a time and cannot see
  // that removing two letters would let a third one behave.
  // ONLY WHEN THE STEM ENDS IN A MAGIC E, which is exactly the case that needs it. A first
  // attempt stripped -ly whenever the word did not end in a vowel before it, and that excluded
  // every -ely adverb — precisely, nicely, widely, likely — which are the entire point. It also
  // wanted to strip "family" and "really", where the l belongs to the stem.
  //
  // A stem of the form consonant + e is unambiguous: nice, wide, precise, polite, complete,
  // rude. Nothing else is stripped, and nothing else needs to be, because -ly only breaks
  // spelling when it puts a consonant after a magic e.
  let advLy = false;
  if(/[a-z]{3,}[^aeiouy][aeiou]?[^aeiouy]?ely$/.test(w) || /[a-z]{2,}[^aeiouy]ely$/.test(w)){
    const stem = w.slice(0, -2);
    if(/[^aeiouy]e$/.test(stem)){ advLy = true; w = stem; }
  }
  if(/[a-z]{3,}ed$/.test(w)){
    inflect='ed';
    // The `e` before `d` belongs to the STEM in two cases and to the ending otherwise. It stays
    // when the preceding letter is a soft c or g, which need it to stay soft — "diverged",
    // "aged", "danced" — and when it is the magic e of a long vowel: "timed", "hoped", "used".
    // It goes after a doubled consonant, which is a spelling device and not a stem letter:
    // "travelled" kept it and came out /trævɛləld/.
    w = (/[cg]ed$/.test(w) || /[aeiou][^aeiou]ed$/.test(w)) ? w.slice(0,-1) : w.slice(0,-2);
  } else if(/[a-z]{3,}es$/.test(w) && !/[aeiou]es$/.test(w)){
    inflect='s';
    w = w.slice(0,-1);                    // "times" -> "time", magic e intact
  } else if(/[a-z]{3,}[^aeious]s$/.test(w)){
    inflect='s';
    w = w.slice(0,-1);
  }

  // ── THE DICTIONARY, AGAIN, ON THE STEM ──────────────────────────────────
  // It was consulted once, on the whole word, before the inflection came off — so `create` was
  // known and `created` was not, and every irregular word in the dictionary lost its plural and
  // its past tense to the letter rules. Asked again here, now that the ending is off, and the
  // ending is reattached below exactly as it would have been.
  if(inflect && dict[w]){
    const out2 = dict[w].slice();
    const last = out2[out2.length-1];
    const VOICELESS2 = ['p','t','k','f','θ','s','ʃ'];
    const SIB2 = ['s','z','ʃ','ʒ'];
    if(inflect === 'ed'){
      if(last === 't' || last === 'd') out2.push('ɪ','d');
      else if(VOICELESS2.includes(last)) out2.push('t');
      else out2.push('d');
    } else {
      if(SIB2.includes(last)) out2.push('ɪ','z');
      else if(VOICELESS2.includes(last)) out2.push('s');
      else out2.push('z');
    }
    return withStress(spelling, { ph: out2, from: BUILTIN_DICT[w] ? 'built in' : 'remembered' });
  }

  // Strip the shaped final letter and hold its sound back; the rules run on what is left.
  let tail=null;
  for(const [re,ph] of WORD_SHAPE) if(re.test(w)){ tail=ph; w=w.slice(0,-1); break; }
  // the adverb's own two sounds go back on after everything else, so the stem spells itself
  if(advLy) tail = (tail || []).concat(['l','i']);
  // reduce the vowel of a weak first syllable before the rules see it
  let weak=0;
  const m0=w.match(WEAK_FIRST);
  if(m0 && !/^[aeiou]{2}/.test(w)){
    const pre=m0[1];
    const vi=pre.search(/[aeiou]/);
    if(vi>=0){ out.push(...(vi?[]:[]) ); weak=vi+1; }
  }
  if(weak){
    // consonants before the weak vowel go through the rules as usual
    let head=w.slice(0,weak-1), rest=w.slice(weak);
    let hg=0;
    while(head.length && hg++<8){
      let hit=null;
      for(const [re,ph] of G2P_RULES){ const mm=head.match(re); if(mm){ hit=[mm[0].length||1,ph]; break; } }
      if(!hit){ head=head.slice(1); continue; }
      out.push(...hit[1]); head=head.slice(hit[0]);
    }
    out.push('ə');
    w=rest;
  }
  while(w.length && guard++<200){
    let hit=null;
    for(const [re,ph,after] of G2P_RULES){
      const m=w.match(re);
      if(!m) continue;
      // A rule may require something of what came BEFORE it. Asked of the last SOUND produced
      // rather than of the preceding letters, which is what such a rule always means: `-le` is a
      // syllable of its own after a consonant (little, table) and not after a vowel (hole, pole),
      // and it is the consonant that makes the schwa, not the letter.
      if(after && !after.test(out.length ? out[out.length-1] : '')) continue;
      hit=[m[0].length||1, ph]; break;
    }
    if(!hit){ w=w.slice(1); continue; }           // unknown letter: skip it
    out.push(...hit[1]);
    w=w.slice(hit[0]);
  }
  if(tail) out.push(...[].concat(tail));   // a tail may be one sound or several
  // ---- reattach the inflection, decided by the stem's LAST SOUND ----
  // Which is why it had to be split off before the letter rules ran: "diverged" ends in the
  // letter e and the sound /dʒ/, and it is the sound that chooses.
  if(inflect){
    const last = out.length ? out[out.length-1] : '';
    const VOICELESS = 'p t k f θ s ʃ'.split(' ');
    const SIB = 's z ʃ ʒ'.split(' ').concat(['t͡ʃ','d͡ʒ']);
    if(inflect === 'ed'){
      if(last === 't' || last === 'd') out.push('ɪ','d');
      else if(VOICELESS.includes(last)) out.push('t');
      else out.push('d');
    } else {
      const sibilant = SIB.includes(last) || (out.length>1 && last==='ʒ') ||
                       (out.length>1 && out[out.length-2]==='d' && last==='ʒ');
      if(sibilant) out.push('ɪ','z');
      else if(VOICELESS.includes(last)) out.push('s');
      else out.push('z');
    }
  }
  // collapse doubled consonants, which English spells but does not say
  const clean=[];
  for(const ph of out) if(!(clean.length && clean[clean.length-1]===ph && !'iɪɛæʌɑɔʊuɝəo'.includes(ph))) clean.push(ph);
  // ---- a final -s is /z/ after a voiced consonant ----
  // The regular plural and third-person -s assimilates to what precedes it: dogs, bells,
  // hands, runs, sells, shells. It stays /s/ after a voiceless one: cats, jumps, hopes.
  //
  // Deliberately NOT applied after a vowel, where the spelling stops predicting anything:
  // "is his has as was" are /z/ but "bus gas yes us plus thus" are /s/, and nothing
  // orthographic separates them. Those go in the dictionary instead. Words spelled -se are
  // excluded for the same reason — the /s/ of "else", "horse" and "false" is not an
  // inflection — and so is -ss, which is never one either.
  const VOICED_C={b:1,d:1,g:1,v:1,'ð':1,z:1,'ʒ':1,m:1,n:1,'ŋ':1,l:1,r:1,w:1,j:1};
  if(/[^s]s$/.test(spelling) && clean.length>1 && clean[clean.length-1]==='s'
     && VOICED_C[clean[clean.length-2]]) clean[clean.length-1]='z';
  return withStress(spelling, {ph:clean, from:'rules'});
}

const BUILTIN_DICT = {
  // ── `ea` THAT IS TWO SYLLABLES ──────────────────────────────────────────
  // In create, the e and the a belong to different syllables: /kri-EYT/, not /kreet/. No rule
  // separates that from the ea of eat, sea and each, because nothing in the spelling says so —
  // it is the same three letters doing a different job, which is what the dictionary is for.
  // The inflections come off before the lookup, so `created` finds `create` and adds its own
  // ending; `creates` and `creating` need their own entries because -ing is not stripped.
  create:  ['k','r','i','eɪ','t'],
  creates: ['k','r','i','eɪ','t','s'],
  creating:['k','r','i','eɪ','t','ɪ','ŋ'],
  creation:['k','r','i','eɪ','ʃ','ə','n'],

  // ── HARD G BEFORE E, I AND Y ────────────────────────────────────────────
  // The soft-g rule is right for gem, gin, gym, giant and gentle, and wrong for a whole
  // Germanic seam underneath it: get, give, girl, gift, begin. No rule separates them — the
  // soft ones came through French and the hard ones did not — so a list is the honest answer
  // and this is the frequent end of it.
  get:['g','ɛ','t'], gets:['g','ɛ','t','s'], getting:['g','ɛ','t','ɪ','ŋ'],
  girl:['g','ɝ','l'], girls:['g','ɝ','l','z'], gift:['g','ɪ','f','t'],
  begin:['b','ɪ','g','ɪ','n'], beginning:['b','ɪ','g','ɪ','n','ɪ','ŋ'],
  began:['b','ɪ','g','æ','n'], forget:['f','ɔ','r','g','ɛ','t'],
  gear:['g','i','r'], geese:['g','i','s'], giggle:['g','ɪ','g','ə','l'],

  // ── OU BEFORE R ─────────────────────────────────────────────────────────
  // /ɔr/ in four, pour, course, court; /aʊr/ in sour, flour, scour, our. Same letters, same
  // following r, no rule between them. The /ɔr/ side is the one the letter rules get wrong.
  four:['f','ɔ','r'], fourth:['f','ɔ','r','θ'], pour:['p','ɔ','r'],
  course:['k','ɔ','r','s'], court:['k','ɔ','r','t'], mourn:['m','ɔ','r','n'],
  source:['s','ɔ','r','s'], "your":['j','ɔ','r'],

  // English spells /θ/ and /ð/ identically. Only a list can tell them apart, and the
  // voiced ones are almost all function words — a short list covers most of the language.
  // The words English simply does not spell phonetically. Rules reach about 60%; the rest
  // is memorised, by people as much as by programs.
  // "augh" is /ɔ/ by rule; these are the words where it is not. See the aught rule above.
  laughter:['l','æ','f','t','ɝ'], laughed:['l','æ','f','t'], draught:['d','r','æ','f','t'],
  draughts:['d','r','æ','f','t','s'], laughs:['l','æ','f','s'],
  // The commonest words in English are the least regular ones, which is why they are here.
  // "I" is a single letter naming a sound no rule would give it; a/of/to/do/is/his/has/as are
  // function words; great/break/steak are the three "ea" words that are /eɪ/ and not /i/.
  i:['aɪ'], a:['ə'], of:['ʌ','v'], to:['t','u'], do:['d','u'],
  is:['ɪ','z'], his:['h','ɪ','z'], has:['h','æ','z'], as:['æ','z'],
  great:['g','r','eɪ','t'], break:['b','r','eɪ','k'], steak:['s','t','eɪ','k'],
  // Final -ow is /oʊ/ by rule, which is right for yellow, window, show, know, grow and slow.
  // These are the ones where it is /aʊ/, and nothing in the spelling tells them apart —
  // "how" and "show" differ by a letter that changes the vowel it is not attached to.
  how:['h','aʊ'], now:['n','aʊ'], cow:['k','aʊ'], brow:['b','r','aʊ'], vow:['v','aʊ'],
  plow:['p','l','aʊ'], allow:['ə','l','aʊ'], bow:['b','aʊ'],
  // "ea" is /i/ by rule; this is the short-/ɛ/ set. All of them also take a voiced "th".
  leather:['l','ɛ','ð','ɝ'], weather:['w','ɛ','ð','ɝ'], feather:['f','ɛ','ð','ɝ'],
  heather:['h','ɛ','ð','ɝ'], breath:['b','r','ɛ','θ'], head:['h','ɛ','d'],
  bread:['b','r','ɛ','d'], dead:['d','ɛ','d'], ready:['r','ɛ','d','i'],
  // ---- stressed open syllables, which are NOT derivable ----
  // "peter" wants /i/, "piper" wants /aɪ/, "lazy" wants /eɪ/ — a stressed syllable with no
  // coda takes the long vowel. It looks like a rule and it is not one: "city", "river",
  // "seven", "model", "lemon", "cabin", "robin", "solid", "second", "busy", "many" and
  // "banana" have exactly the same shape and take the SHORT vowel, and the letters do not
  // say which. Tested before writing the rule: it would have fixed eleven words and broken
  // twelve, and the twelve are right today. So this is a list, because the fact is lexical.
  peter:['p','i','t','ɝ'], piper:['p','aɪ','p','ɝ'], lazy:['l','eɪ','z','i'],
  baby:['b','eɪ','b','i'], paper:['p','eɪ','p','ɝ'], later:['l','eɪ','t','ɝ'],
  table:['t','eɪ','b','ə','l'], tiger:['t','aɪ','g','ɝ'], final:['f','aɪ','n','ə','l'],
  open:['oʊ','p','ə','n'], robot:['r','oʊ','b','ɑ','t'], over:['oʊ','v','ɝ'],
  total:['t','oʊ','t','ə','l'], moment:['m','oʊ','m','ə','n','t'], even:['i','v','ə','n'],
  student:['s','t','u','d','ə','n','t'], human:['h','j','u','m','ə','n'],
  tiny:['t','aɪ','n','i'], lady:['l','eɪ','d','i'], crazy:['k','r','eɪ','z','i'],
  local:['l','oʊ','k','ə','l'], spider:['s','p','aɪ','d','ɝ'], super:['s','u','p','ɝ'],
  data:['d','eɪ','t','ə'], photo:['f','oʊ','t','oʊ'], motor:['m','oʊ','t','ɝ'],
  secret:['s','i','k','r','ə','t'], legal:['l','i','g','ə','l'], silent:['s','aɪ','l','ə','n','t'],
  hello:['h','ə','l','oʊ'], hi:['h','aɪ'], hey:['h','eɪ'],
  because:['b','ɪ','k','ɔ','z'], again:['ə','g','ɛ','n'], any:['ɛ','n','i'],
  many:['m','ɛ','n','i'], said:['s','ɛ','d'], says:['s','ɛ','z'],
  one:['w','ʌ','n'], once:['w','ʌ','n','s'], two:['t','u'], who:['h','u'],
  what:['w','ʌ','t'], want:['w','ɔ','n','t'], was:['w','ʌ','z'], were:['w','ɝ'],
  are:['ɑ','r'], have:['h','æ','v'], give:['g','ɪ','v'], live:['l','ɪ','v'],
  come:['k','ʌ','m'], some:['s','ʌ','m'], done:['d','ʌ','n'], love:['l','ʌ','v'],
  computer:['k','ə','m','p','j','u','t','ɝ'], together:['t','ə','g','ɛ','ð','ɝ'],
  potato:['p','ə','t','eɪ','t','oʊ'], tomato:['t','ə','m','eɪ','t','oʊ'],
  music:['m','j','u','z','ɪ','k'], use:['j','u','z'], you:['j','u'], your:['j','ɔ','r'],
  friend:['f','r','ɛ','n','d'], school:['s','k','u','l'], their:['ð','ɛ','r'],
  eye:['aɪ'], eyes:['aɪ','z'], door:['d','ɔ','r'], floor:['f','l','ɔ','r'],
  // English writes "oo" for two different vowels and gives no clue which. Only a list knows.
  good:['g','ʊ','d'], book:['b','ʊ','k'], look:['l','ʊ','k'], took:['t','ʊ','k'],
  foot:['f','ʊ','t'], hood:['h','ʊ','d'], wood:['w','ʊ','d'], wool:['w','ʊ','l'],
  could:['k','ʊ','d'], would:['w','ʊ','d'], should:['ʃ','ʊ','d'], put:['p','ʊ','t'],
  bulldog:['b','ʊ','l','d','ɔ','g'],
  the:['ð','ə'], this:['ð','ɪ','s'], that:['ð','æ','t'], then:['ð','ɛ','n'],
  them:['ð','ɛ','m'], these:['ð','i','z'], those:['ð','oʊ','z'], there:['ð','ɛ','r'],
  their:['ð','ɛ','r'], they:['ð','eɪ'], though:['ð','oʊ'], than:['ð','æ','n'],
  with:['w','ɪ','θ'], mother:['m','ʌ','ð','ɝ'], father:['f','ɑ','ð','ɝ'],
  brother:['b','r','ʌ','ð','ɝ'], other:['ʌ','ð','ɝ'], measure:['m','ɛ','ʒ','ɝ'],
  goal:['g','o','l'],
  maximus:['m','æ','k','s','ɪ','m','ə','s'],  max:['m','æ','k','s'],
  jupiter:['d','ʒ','u','p','ɪ','t','ɝ'],
  solana:['s','o','l','ɑ','n','ə'],
  orion:['ɔ','r','aɪ','ə','n'],
  atlas:['æ','t','l','ə','s'],
  rachel:['r','eɪ','t','ʃ','ə','l'],
  john:['d','ʒ','ɑ','n'],           bo:['b','o'],
  momo:['m','o','m','o'],           cliff:['k','l','ɪ','f'],
  gloria:['g','l','ɔ','r','i','ə'], greg:['g','r','ɛ','g'],
  bridget:['b','r','ɪ','d','ʒ','ɪ','t'],
  eric:['ɛ','r','ɪ','k'],           dan:['d','æ','n'],
  lincoln:['l','ɪ','ŋ','k','ə','n'],
  wizard:['w','ɪ','z','ɝ','d'],     banana:['b','ə','n','æ','n','ə'],
  princess:['p','r','ɪ','n','s','ɛ','s'],
  sparkle:['s','p','ɑ','r','k','ə','l'],
};
function loadDict(){
  let user={};
  try{ user=JSON.parse(STORE.getItem('hollerbox.dict')||'{}'); }catch(e){}
  // built in, then anything a program taught this session, then this person's own corrections —
  // so a user who has fixed a name keeps their version even if the program ships a different one
  return {...BUILTIN_DICT, ...TAUGHT, ...user};
}
// ── TAKING THE NAMES SOMEWHERE ELSE ──────────────────────────────────────
//
// Words taught with Remember live in this browser's localStorage and nowhere else. That is right
// for a person correcting their own vocabulary and wrong the moment the same words are needed by
// another program — a football simulator that says the names of your family and friends needs
// those pronunciations, and its users are not going to teach them again one at a time.
//
// `learned()` hands back what has been taught, as a plain object that can be pasted into source.
// `teach()` takes such an object without touching storage, which is how another program loads a
// list it shipped rather than one it remembered.
//
//     const names = HOLLER_SPELL.learned();      // in the app, after teaching
//     HOLLER_SPELL.teach(names);                 // in the sim, at startup
//
// Only the taught words come back, not the built-in ones — otherwise every export would carry a
// copy of the dictionary and the two would drift apart the first time a built-in changed.
function learned(){
  try {
    const user = JSON.parse(STORE.getItem('hollerbox.dict') || '{}');
    const out = {};
    for (const k of Object.keys(user).sort()) if (!BUILTIN_DICT[k]) out[k] = user[k];
    return out;
  } catch (e) { return {}; }
}

/** Load words for this session without writing to storage. A program shipping a name list wants
 *  them present, not remembered — and writing them would mean a user's own corrections could be
 *  silently overwritten by an update. */
const TAUGHT = {};
function teach(words){
  if (!words) return 0;
  let n = 0;
  for (const [w, ph] of Object.entries(words)) {
    if (!Array.isArray(ph) || !ph.length) continue;
    TAUGHT[String(w).toLowerCase().replace(/[^a-z]/g, '')] = ph.slice();
    n++;
  }
  return n;
}

function saveWord(word,ph){
  try{ const d=loadDict(); d[String(word).toLowerCase().replace(/[^a-z]/g,'')]=ph.slice();
       STORE.setItem('hollerbox.dict',JSON.stringify(d)); }catch(e){}
}

root.HOLLER_SPELL = { G2P_RULES, BUILTIN_DICT, PAUSE, WEAK_FIRST, WORD_SHAPE,
                  NUCLEI, STRESS_DICT, WEAK_STRESS, legalOnset, syllabify, stressIndex, markStress,
                  g2p, g2pWord, loadDict, saveWord, useStorage, learned, teach };
if (typeof module !== 'undefined' && module.exports) module.exports = root.HOLLER_SPELL;

})(typeof window !== 'undefined' ? window : globalThis);
