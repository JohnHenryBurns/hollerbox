"""Stage 0, posed so that the engine's posture table drops out of it.

`register.py` asked whether the engine's OWN vowel postures could be read off the coils, and they
cannot: the table was solved against American formant data for a British speaker, and three of its
six parameters turned out to be acoustic knobs wearing anatomical names — the engine's `jaw`
follows the tongue-tip coil, its tip parameters follow the dorsum. Registering measured coils
against that table was registering against the wrong thing.

So ask the question without the table. The coils are measured. The speaker's formants are measured,
from the same tokens. The engine's forward map from posture to formants is fixed. The only unknown
is the reading of the coils:

    Is there ONE affine reading of the six coils — one coil coordinate per posture parameter, twelve
    numbers, fixed across all vowels — under which the tube reproduces this speaker's vowel formants?

If yes, that reading is the stage 0 map, it is anatomical by construction (each parameter is read
from the coil that physically corresponds to it), and the speaker-specific posture table falls out
as a by-product: the map applied to each vowel's mean coil vector. If no, then the tube's six
parameters cannot describe this speaker's articulation, and the plan stops here as designed.

THE TEST is leave-one-vowel-out, as before: fit the twelve numbers on ten vowels, read the eleventh's
posture off its coils, measure the tube's formants, and compare with the speaker's, in units of the
speaker's own token-to-token formant spread (the IQR from `speaker_formants.csv`).

COST. One objective evaluation is eleven postures through the tract's transfer function, about 0.4 s.
Nelder–Mead over twelve parameters takes on the order of a thousand evaluations, so the fit is
minutes and the leave-one-out is under an hour, warm-started from the full fit.

    python -m fit.jointmap                fit on all vowels, report, then leave-one-out
    python -m fit.jointmap --no-loo       just the fit
    python -m fit.jointmap --save fit/mngu0_map.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .mngu0 import MONOPHTHONGS

REPO = Path(__file__).resolve().parents[2]
POSTURE = REPO / "lab" / "posture.js"
OUT = REPO / "research" / "out"

ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]
#: one coil coordinate per parameter, declared before any number was looked at (see register.py)
PREDICTOR = {"jaw": "JAW_y", "bodyPos": "T2_x", "bodyHi": "T2_y",
             "tipPos": "T1_x", "tipHi": "T1_y", "lip": "lipap"}
#: the eleven vowels with an engine counterpart, plus LOT, which the engine never had
VOWELS = ["i", "I", "E", "a", "V", "A", "O", "U", "u", "@@", "@", "Q"]


def formants(postures: dict[str, dict[str, float]], n: int) -> dict[str, list[float]]:
    done = subprocess.run(["node", str(POSTURE), "--formants", "--n", str(n)], input=json.dumps(postures),
                          capture_output=True, text=True, cwd=REPO, encoding="utf-8")
    if done.returncode != 0:
        raise RuntimeError(done.stderr)
    return json.loads(done.stdout)


def coil_table(tokens: Path, max_rms: float, min_dur: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    tok = pd.read_csv(tokens)
    v = tok[tok.phone.isin(MONOPHTHONGS) & (tok.rms_max <= max_rms) & (tok.dur >= min_dur)].copy()
    v["lipap"] = v["UL_y"] - v["LL_y"]
    cols = sorted(set(PREDICTOR.values()))
    g = v.groupby("phone")
    return g[cols].mean(), g[cols].std()


class Problem:
    def __init__(self, coils: pd.DataFrame, targets: pd.DataFrame, vowels: list[str], n: int):
        self.coils, self.targets, self.vowels, self.n = coils, targets, vowels, n
        self.evals = 0
        self.cache: dict[tuple, float] = {}

    # ---- the map: twelve numbers, in a fixed order ----
    @staticmethod
    def unpack(x: np.ndarray) -> dict[str, tuple[float, float]]:
        return {p: (float(x[2 * i]), float(x[2 * i + 1])) for i, p in enumerate(ARTS)}

    @staticmethod
    def pack(m: dict[str, tuple[float, float]]) -> np.ndarray:
        return np.array([v for p in ARTS for v in m[p]], dtype=float)

    def postures(self, x: np.ndarray, vowels: list[str] | None = None) -> dict[str, dict[str, float]]:
        m = self.unpack(x)
        out = {}
        for c in vowels or self.vowels:
            out[c] = {p: m[p][0] + m[p][1] * float(self.coils.loc[c, PREDICTOR[p]]) for p in ARTS}
        return out

    def score(self, got: dict[str, list[float]], post: dict[str, dict[str, float]]) -> tuple[float, pd.DataFrame]:
        rows, total = [], 0.0
        for c, f in got.items():
            t = self.targets.loc[c]
            f1 = f[0] if len(f) > 0 else np.nan
            f2 = f[1] if len(f) > 1 else np.nan
            # a shape with fewer than two peaks below 3.4 kHz is not a vowel; charge it heavily
            e1 = (f1 - t.F1) / t.F1_iqr if np.isfinite(f1) else 6.0
            e2 = (f2 - t.F2) / t.F2_iqr if np.isfinite(f2) else 6.0
            # and postures the map pushes outside [0, 1] are clamped by the engine; charge the excess
            over = sum(max(0.0, -v) + max(0.0, v - 1.0) for v in post[c].values())
            total += e1 ** 2 + e2 ** 2 + 25.0 * over ** 2
            rows.append({"vowel": c, "F1_tgt": t.F1, "F1": f1, "z1": e1, "F2_tgt": t.F2, "F2": f2, "z2": e2, "outside": over})
        return total, pd.DataFrame(rows)

    def __call__(self, x: np.ndarray) -> float:
        key = tuple(np.round(x, 6))
        if key in self.cache:
            return self.cache[key]
        post = self.postures(x)
        got = formants({c: {k: min(1.0, max(0.0, v)) for k, v in A.items()} for c, A in post.items()}, self.n)
        total, _ = self.score(got, post)
        self.evals += 1
        self.cache[key] = total
        return total

    def report(self, x: np.ndarray, vowels: list[str] | None = None) -> pd.DataFrame:
        post = self.postures(x, vowels)
        got = formants({c: {k: min(1.0, max(0.0, v)) for k, v in A.items()} for c, A in post.items()}, self.n)
        _, df = self.score(got, post)
        for p in ARTS:
            df[p] = [post[c][p] for c in df.vowel]
        return df


def fit(problem: Problem, x0: np.ndarray, maxfev: int, label: str) -> np.ndarray:
    t0 = time.time()
    problem.evals = 0
    # A scale per parameter for the initial simplex: intercepts are posture units, slopes are
    # posture units per cm and the coil ranges are 0.3–0.6 cm, so slopes need to be able to move
    # by about 1 per cm to matter.
    res = minimize(problem, x0, method="Nelder-Mead",
                   options={"maxfev": maxfev, "xatol": 1e-3, "fatol": 1e-3, "adaptive": True,
                            "initial_simplex": _simplex(x0)})
    print(f"  {label}: {problem.evals} evaluations, {time.time() - t0:.0f} s, objective {res.fun:.2f}")
    return res.x


def _simplex(x0: np.ndarray) -> np.ndarray:
    steps = np.array([0.15, 0.6] * 6)          # intercept step, slope step, per parameter
    S = np.tile(x0, (len(x0) + 1, 1))
    for i in range(len(x0)):
        S[i + 1, i] += steps[i]
    return S


def polish(problem: Problem, x: np.ndarray, label: str, rounds: int = 10) -> np.ndarray:
    """Shrinking-step coordinate descent from x — the house method in fit-auto.js and friends.

    Here because Nelder–Mead in twelve dimensions stalls: the first run left three of the six slopes
    at zero and reported convergence, and a second pass from the answer did not move. One axis at a
    time cannot stall on a ridge it is not looking along.
    """
    step = np.array([0.08, 0.30] * 6)
    best = problem(x)
    t0 = time.time()
    for r in range(rounds):
        moved = False
        for i in range(len(x)):
            for sgn in (+1.0, -1.0):
                xt = x.copy()
                xt[i] += sgn * step[i]
                f = problem(xt)
                if f < best - 1e-6:
                    x, best, moved = xt, f, True
                    break
        if not moved:
            step *= 0.5
        print(f"  {label}: round {r + 1}, objective {best:.2f}, step {step[1]:.3f}", flush=True)
        if step[1] < 0.01:
            break
    print(f"  {label}: polished in {time.time() - t0:.0f} s", flush=True)
    return x


def engine_table_start(coils: pd.DataFrame, vowels: list[str]) -> np.ndarray | None:
    """The map register.py fits to the engine's own posture table: wrong targets, right scale.

    Its slopes have the physical size and sign a coil reading needs — lip about +1 per cm of
    aperture, body position about −0.6 per cm — which the neutral start has to discover and did
    not. Used as a second start, never as an answer.
    """
    try:
        from .register import PAIRS, engine_postures, fit_map
    except ImportError:
        return None
    art = engine_postures()
    vs = [c for c in vowels if c in PAIRS]
    m = fit_map(coils, art, vs, PREDICTOR)
    return Problem.pack({p: (m[p]["intercept"], m[p]["slope"]) for p in ARTS})


def _loo_one(job) -> dict:
    """Fit without one vowel and read that vowel off the result. A worker, so it is module-level."""
    coils, targets, rest, n, x, maxfev, held = job
    Q = Problem(coils, targets, rest, n)
    res = minimize(Q, x, method="Nelder-Mead",
                   options={"maxfev": maxfev, "xatol": 1e-3, "fatol": 1e-3, "adaptive": True,
                            "initial_simplex": _simplex(x)})
    xh = polish(Q, res.x, f"polish without {held}", rounds=6)
    r = Q.report(xh, [held]).iloc[0]
    return {"vowel": held, "F1_tgt": r.F1_tgt, "F1": r.F1, "z1": r.z1, "F2_tgt": r.F2_tgt, "F2": r.F2, "z2": r.z2,
            "evals": Q.evals, **{p: r[p] for p in ARTS}}


def tract_sections(f3_median: float) -> int:
    """Tract length from F3 the way fit-preset.js does it: L = 5c/4F3, at 44.1 kHz sections."""
    cm = 5 * 35000 / (4 * f3_median)
    return int(max(20, min(60, round(cm / 100 / (350 / (44100 * 2))))))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokens", type=Path, default=OUT / "mngu0_tokens.csv")
    ap.add_argument("--formants", type=Path, default=OUT / "speaker_formants.csv")
    ap.add_argument("--min-dur", type=float, default=0.0)
    ap.add_argument("--max-rms", type=float, default=10.0)
    ap.add_argument("--n", type=int, help="tract sections; default from the speaker's F3")
    ap.add_argument("--maxfev", type=int, default=1500)
    ap.add_argument("--no-loo", action="store_true")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--save", type=Path)
    ap.add_argument("--warm", type=Path, help="a saved map JSON to use as an extra start")
    args = ap.parse_args()
    pd.set_option("display.width", 200); pd.set_option("display.max_columns", 30)
    sys.stdout.reconfigure(line_buffering=True)      # a redirected log should show progress

    coils, sd = coil_table(args.tokens, args.max_rms, args.min_dur)
    targets = pd.read_csv(args.formants).set_index("phone")
    vowels = [c for c in VOWELS if c in coils.index and c in targets.index]
    n = args.n or tract_sections(float(targets.loc[vowels, "F3"].median()))
    print(f"{len(vowels)} vowels: {' '.join(vowels)};  tract {n} sections "
          f"({n * 350 / (44100 * 2) * 100:.1f} cm, from the speaker's median F3 {targets.loc[vowels, 'F3'].median():.0f} Hz)")

    P = Problem(coils, targets, vowels, n)
    # Several starts, because twelve-dimensional Nelder–Mead settles on the first ridge it finds.
    starts = {
        # a neutral posture for every vowel, slopes at zero — the search has to earn everything
        "neutral": P.pack({"jaw": (0.5, 0.0), "bodyPos": (0.5, 0.0), "bodyHi": (0.4, 0.0),
                           "tipPos": (0.84, 0.0), "tipHi": (0.05, 0.0), "lip": (0.6, 0.0)}),
    }
    eng = engine_table_start(coils, vowels)
    if eng is not None:
        starts["engine-table map"] = eng
    if args.warm and args.warm.exists():
        prev = json.loads(args.warm.read_text(encoding="utf-8"))["map"]
        starts["previous fit"] = P.pack({p: (prev[p]["intercept"], prev[p]["slope"]) for p in ARTS})
    print(f"  (objective is the sum over vowels of z1^2 + z2^2; {2 * len(vowels)} = every formant one IQR off)")
    best_x, best_f = None, np.inf
    for name, x0 in starts.items():
        print(f"  start '{name}': objective {P(x0):.2f}", flush=True)
        xs = fit(P, x0, args.maxfev, f"NM from {name}")
        xs = polish(P, xs, f"polish {name}")
        f = P(xs)
        if f < best_f:
            best_x, best_f = xs, f
    x = best_x
    print(f"  best of {len(starts)} starts: objective {best_f:.2f}", flush=True)

    m = P.unpack(x)
    print("\n=== the joint map ===")
    print(f"  {'param':8} {'from':7} {'intercept':>10} {'slope/cm':>9}")
    for p in ARTS:
        print(f"  {p:8} {PREDICTOR[p]:7} {m[p][0]:10.3f} {m[p][1]:9.3f}")
    rep = P.report(x)
    print("\n=== fitted formants against the speaker's (z in speaker IQR units) ===")
    print(rep.round(3).to_string(index=False))
    print(f"\n  median |z| {pd.concat([rep.z1, rep.z2]).abs().median():.2f}; "
          f"share within 1 IQR {(pd.concat([rep.z1, rep.z2]).abs() <= 1).mean() * 100:.0f}%, within 2 {(pd.concat([rep.z1, rep.z2]).abs() <= 2).mean() * 100:.0f}%")
    rep.to_csv(OUT / "stage0_joint_fit.csv", index=False)

    if args.save:
        payload = {"what": "mngu0 s1 coil coordinates -> hollerbox posture, affine, one coil coordinate per parameter, "
                           "solved so the tube reproduces the speaker's own vowel formants",
                   "sections": n, "vowels": vowels, "predictor": PREDICTOR,
                   "map": {p: {"from": PREDICTOR[p], "intercept": m[p][0], "slope": m[p][1]} for p in ARTS},
                   "postures": {c: rep.set_index("vowel").loc[c, ARTS].to_dict() for c in vowels},
                   "coil_means": {c: coils.loc[c].to_dict() for c in vowels},
                   "fit": rep.drop(columns=ARTS).to_dict(orient="records"),
                   "rule": "provisional until the leave-one-out below is judged; once accepted, fixed and never refitted"}
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  saved {args.save}")

    if args.no_loo:
        return

    print(f"\n=== leave-one-vowel-out, warm-started from the full fit, {args.jobs} in parallel ===")
    jobs = [(coils, targets, [c for c in vowels if c != held], n, x, args.maxfev // 2, held) for held in vowels]
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        rows = list(pool.map(_loo_one, jobs))
    for r in rows:
        print(f"    {r['vowel']:3} F1 {r['F1']:5.0f} vs {r['F1_tgt']:5.0f} (z {r['z1']:+5.2f})   "
              f"F2 {r['F2']:5.0f} vs {r['F2_tgt']:5.0f} (z {r['z2']:+5.2f})   {r['evals']} evals")
    loo = pd.DataFrame(rows)
    loo.to_csv(OUT / "stage0_joint_loo.csv", index=False)
    z = pd.concat([loo.z1, loo.z2]).abs()
    print(f"\n  held-out: median |z| {z.median():.2f}; within 1 IQR {(z <= 1).mean() * 100:.0f}%, within 2 IQR {(z <= 2).mean() * 100:.0f}%")
    print(f"  wrote {OUT / 'stage0_joint_loo.csv'}")


if __name__ == "__main__":
    main()
