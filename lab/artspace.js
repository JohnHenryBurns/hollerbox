//
// THE TRACT SHAPE, READ BACK AS A POSTURE.
//
// `articulate(A, n)` turns six articulators into forty-four diameters. This inverts it: given a
// diameter array, it finds the posture that would have produced it.
//
// WHY THIS EXISTS. `buildWord` emits two representations of every keyframe — `art`, six
// articulators, and `keys[].d`, the diameters `articulate` makes from them. They agree at the
// keyframes and nowhere else. Between keyframes the worklet runs a critically damped follower
// (`tract-worklet.js:417`) over the DIAMETERS, per section, with per-section stiffness and a hard
// floor at 0.02 — while `art` is smoothstepped with no mass at all. So the six articulators are
// what the mouth view DRAWS and the diameters are what the tube SPEAKS, and `artT`, `artCrit`,
// `artStiff`, `artPush`, `artFar` and `velT` move the second and leave the first exactly where it
// was. ROADMAP.md already says this at line 1623: "art is emitted by buildWord and ignored by the
// worklet". `lab/trajectories.js` exports `art` and its header claims that is "what is seen and
// heard". Half right — it is what is seen.
//
// Fitting measured articulography against `art` would therefore fit a quantity that no control
// parameter can move. Fitting it against the raw diameters means mapping flesh-point positions
// onto an area function, which is the ill-posed half of this whole field. Reading the diameters
// back into posture coordinates avoids both: six numbers, bounded, with roughly one-to-one
// correspondence to where the sensors actually sit — and it uses the engine's own forward map, so
// there is no second implementation to drift.
//
// WHAT IT CANNOT DO, said here rather than discovered later. `articulate` is not injective:
//
//   - it floors every section at 0.02, so a sealed tract is the same array whatever the tongue was
//     doing behind the seal. Every stop closure is unrecoverable BY CONSTRUCTION.
//   - `lip` only caps the last 6% of sections, and only through a `min`. Whenever the tongue
//     already narrows the mouth more than the lips do, `lip` leaves no trace at all.
//   - the tip hump is 0.085 wide against the body's 0.30, so at 44 sections the tip is carried by
//     about four of them.
//
// So the inversion reports `clamped` (the fraction of sections sitting on a floor or a cap) beside
// every posture. A frame with a high clamped fraction has a posture that is a guess, and a residual
// regressed against it is a residual regressed against a guess. Drop those frames or say so.
//
// METHOD. Levenberg-Marquardt on six bounded parameters with a forward-difference Jacobian, rather
// than the shrinking-step coordinate descent used in `fit-auto.js`, `fit-dynamics.js` and
// `solve-consonants.js`. The deviation is on purpose and it is about cost: this runs per FRAME, so
// a corpus pass is millions of inversions where those three run thousands of evaluations total.
// LM converges in about ten iterations at seven forward evaluations each; coordinate descent wants
// twenty-odd rounds at twenty-four. Same answer, verified against each other by the recovery check.
//
//   node lab/artspace.js --check     round-trip a planted posture and report recovery
//

const path = require('path');
const P = require(path.join(__dirname, '..', 'engine', 'phonemes.js'));

const ARTS = ['jaw', 'bodyPos', 'bodyHi', 'tipPos', 'tipHi', 'lip'];

const unit = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const toVec = A => ARTS.map(k => A[k]);
const toArt = v => { const o = {}; for (let i = 0; i < 6; i++) o[ARTS[i]] = v[i]; return o; };

/** How much of this shape is sitting on a limit, and therefore carries no information about the
 *  posture that made it. The 0.02 floor is `articulate`'s own; 0.8 is the glottal cap. */
function clampedFraction(d, n) {
  let c = 0;
  for (let i = 0; i < n; i++) if (d[i] <= 0.0201) c++;
  return c / n;
}

function fill(v, d, n, r) {
  const got = P.articulate(toArt(v), n);
  let ss = 0;
  for (let i = 0; i < n; i++) { const e = got[i] - d[i]; r[i] = e; ss += e * e; }
  return ss;
}

/** Solve a 6x6 symmetric system by Gaussian elimination with partial pivoting. Six is small
 *  enough that nothing cleverer earns its complexity. Returns null if singular. */
function solve6(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 6; c++) {
    let p = c;
    for (let r = c + 1; r < 6; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-14) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 6; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= 6; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[6] / m[i][i]);
}

/**
 * Find the posture whose area function is closest to `d`.
 *
 * @param d   the diameter array to explain (length >= n)
 * @param n   section count
 * @param A0  where to start. Pass the PLANNED posture when there is one — it is free and it is
 *            close. The recovery check deliberately starts somewhere else, because a warm start
 *            that is already the answer would test nothing.
 * @returns {A, rms, worst, clamped, iters} — rms and worst are in diameter units, so they are
 *            directly comparable to the 0.02..2.2 range the tract lives in.
 */
function invert(d, n, A0, opts) {
  const o = opts || {};
  const maxIt = o.iters || 40;
  let v = (A0 ? toVec(A0) : [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]).map(unit);

  const r = new Float64Array(n), rh = new Float64Array(n);
  const J = Array.from({ length: 6 }, () => new Float64Array(n));
  let ss = fill(v, d, n, r);
  let lam = 1e-3, it = 0;

  for (; it < maxIt; it++) {
    if (ss < 1e-14) break;

    for (let k = 0; k < 6; k++) {
      // step inward from a bound, so a parameter pinned at 0 or 1 still reports a gradient
      const h = v[k] > 0.5 ? -1e-4 : 1e-4;
      const vv = v.slice(); vv[k] = unit(vv[k] + h);
      const dh = vv[k] - v[k];
      if (dh === 0) { J[k].fill(0); continue; }
      fill(vv, d, n, rh);
      for (let i = 0; i < n; i++) J[k][i] = (rh[i] - r[i]) / dh;
    }

    const JtJ = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const Jtr = new Array(6).fill(0);
    for (let a = 0; a < 6; a++) {
      for (let i = 0; i < n; i++) Jtr[a] -= J[a][i] * r[i];
      for (let b = a; b < 6; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += J[a][i] * J[b][i];
        JtJ[a][b] = JtJ[b][a] = s;
      }
    }

    let stepped = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const M = JtJ.map((row, i) => row.map((x, j) => (i === j ? x * (1 + lam) + 1e-12 : x)));
      const dv = solve6(M, Jtr);
      if (!dv) { lam *= 10; continue; }
      const vn = v.map((x, i) => unit(x + dv[i]));
      const sn = fill(vn, d, n, rh);
      if (sn < ss) {
        v = vn; ss = sn; r.set(rh); lam = Math.max(lam * 0.3, 1e-9);
        stepped = true; break;
      }
      lam *= 10;
      if (lam > 1e9) break;
    }
    if (!stepped) break;
  }

  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(r[i]));
  return { A: toArt(v), rms: Math.sqrt(ss / n), worst, clamped: clampedFraction(d, n), iters: it };
}

/**
 * The same thing, but able to find a hump it did not start on top of.
 *
 * WHY A LOCAL METHOD IS NOT ENOUGH, measured rather than assumed. `hump` returns exactly 0 outside
 * its half-width, and the tip's is 0.085 against the body's 0.30. So if the search starts with the
 * tip at 0.5 and the sound had it at 0.94 — which is every alveolar in the inventory — the two
 * humps do not overlap, the derivative with respect to `tipPos` is identically zero, and the
 * gradient's only available move is to flatten `tipHi` to nothing. Started neutral, LM alone
 * recovered the shape to an rms of 0.08 where the tract's own range is 0.02 to 2.2, and missed
 * /d/ and /t/ by 0.94 of a parameter. That is not the map being non-invertible; that is a local
 * method in a landscape of compact bumps.
 *
 * So the two POSITION parameters get a coarse grid and everything else is left to LM. They are the
 * only two with localised support and therefore the only two that cannot be walked to.
 */
const GRID_BODY = [0.20, 0.35, 0.50, 0.65, 0.80];
const GRID_TIP  = [0.55, 0.65, 0.75, 0.85, 0.94, 1.00];
// Tried and dropped: a second grid axis over hump HEIGHT, on the reasoning that a hump starting
// flat has no position to be moved from either. It doubled the cost and left the worst shape
// residual where it was (0.403 to 0.426 over the random set), so it is not in.

function fit(d, n, opts) {
  const o = opts || {};
  // A warm start is free and usually right, so try it first and keep it if it already explains
  // the shape. The grid is the fallback, not the default.
  if (o.from) {
    const warm = invert(d, n, o.from, o);
    if (warm.rms <= (o.warmTol === undefined ? 1e-4 : o.warmTol)) return warm;
    var best = warm;
  }
  for (const bp of GRID_BODY) for (const tp of GRID_TIP) {
    const got = invert(d, n, { jaw: 0.5, bodyPos: bp, bodyHi: 0.4, tipPos: tp, tipHi: 0.4, lip: 0.5 }, o);
    if (!best || got.rms < best.rms) best = got;
    if (best.rms < 1e-7) return best;
  }
  return best;
}

/** ---- the recovery check ---- *
 *
 * The house rule, from `fit-dynamics.js --check` and `check.js`: a fitter is not to be believed
 * until it has recovered a planted answer. Plant a posture, render it through `articulate`, start
 * the search somewhere else, and report how close it gets back.
 *
 * Two populations, because they fail differently. REAL postures are the inventory in `ART` — the
 * shapes the engine actually visits, including every stop closure, so this is the number that
 * describes what the corpus pass will see. RANDOM postures cover the whole box uniformly and will
 * be worse, because most of the box is tract shapes no phoneme uses.
 */
function recover(n, opts) {
  const o = opts || {};
  const rows = [];
  let seed = o.seed || 20260805;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const planted = [];
  for (const [sym, A] of Object.entries(P.ART)) planted.push({ sym, A });
  for (let i = 0; i < (o.random || 60); i++) {
    const A = {}; for (const k of ARTS) A[k] = rnd();
    planted.push({ sym: null, A });
  }

  for (const { sym, A } of planted) {
    const d = P.articulate(A, n);
    // the grid search, and deliberately NOT warm-started from the answer
    const got = fit(d, n);
    let dev = 0;
    for (const k of ARTS) dev = Math.max(dev, Math.abs(got.A[k] - A[k]));
    rows.push({ sym, kind: sym ? 'real' : 'random', shapeRms: got.rms,
                paramWorst: dev, clamped: got.clamped, iters: got.iters });
  }
  return rows;
}

module.exports = { ARTS, invert, fit, recover, clampedFraction };

/** ---- cli ---- */
if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = (process.argv[i + 1] || '').startsWith('--') ? true
                                             : (process.argv[++i] ?? true);
  }
  const n = Math.round(+(args.n || 44));
  const rows = recover(n, { random: +(args.random || 60) });

  const by = kind => rows.filter(r => r.kind === kind);
  const stat = rs => {
    if (!rs.length) return null;
    const shape = rs.map(r => r.shapeRms).sort((a, b) => a - b);
    const par = rs.map(r => r.paramWorst).sort((a, b) => a - b);
    return { n: rs.length,
             shapeMed: shape[shape.length >> 1], shapeMax: shape[shape.length - 1],
             parMed: par[par.length >> 1], parMax: par[par.length - 1] };
  };

  console.log(`recovering planted postures at n=${n}\n`);
  for (const kind of ['real', 'random']) {
    const s = stat(by(kind));
    if (!s) continue;
    console.log(`  ${kind.padEnd(7)} ${String(s.n).padStart(3)} postures` +
      `   shape rms med ${s.shapeMed.toFixed(5)} max ${s.shapeMax.toFixed(5)}` +
      `   worst param med ${s.parMed.toFixed(4)} max ${s.parMax.toFixed(4)}`);
  }

  // Which ones do not come back, and does the clamped fraction explain it? If it does, the
  // failure is the forward map being many-to-one rather than the search being bad.
  const bad = rows.filter(r => r.paramWorst > 0.05).sort((a, b) => b.paramWorst - a.paramWorst);
  console.log(`\n  ${bad.length} of ${rows.length} postures miss a parameter by more than 0.05`);
  for (const r of bad.slice(0, 12)) {
    console.log(`    ${(r.sym || '(random)').padEnd(10)} worst ${r.paramWorst.toFixed(4)}` +
                `   shape rms ${r.shapeRms.toFixed(5)}   clamped ${(r.clamped * 100).toFixed(0)}%`);
  }
  const explained = bad.filter(r => r.shapeRms < 1e-3).length;
  console.log(`\n  of those, ${explained} reproduce the SHAPE to better than 0.001 anyway` +
              ` — the posture is unidentifiable there, not missed.`);
}
