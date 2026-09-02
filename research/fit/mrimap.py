"""Stage 0 as the plan wrote it: the coil map solved against independently known tract shapes.

The stage 0 map (`jointmap.py`) was solved so that the tube reproduces the speaker's vowel FORMANTS,
and the MRI then showed it to be right for vowels and wrong for every consonant, where it was only
ever an extrapolation. This solves the same twelve numbers — one affine reading per posture
parameter, from the coil that physically corresponds to it — against the speaker's own MRI airway
profiles for all twenty-four phones the static scan holds, with his vowel formants kept as a second
constraint so the acoustics are not lost.

    For phone p with mean coil vector c_p:  A_p = map(c_p);  D_p = articulate(A_p)
    loss = λ · mean_p shape(D_p, MRI_p)  +  mean_vowels z(formants(D_v), speaker_v)²  + penalty(A outside [0,1])

`shape` is the log-normalised profile distance of `mri_fit.py` — the tube's profile against the
image's, both divided by their own mean, so the unknown width-to-diameter factor drops out. A closure
counts as a closure. The formant term is the one stage 0 used, in units of the speaker's own
token-to-token IQR. Multi-start (stage 0's map, the ART-fitted map, neutral), coordinate polish,
then leave-one-phone-out so the map is judged on phones it never saw.

WHAT A PASS WOULD MEAN. Twelve numbers, no per-phone freedom, fitted on 24 phones: if the tube can
make this speaker's consonants AND vowels from his coils through one rigid reading, the map is a
speaker's articulation and not a vowel instrument, and stage 1's measured side becomes trustworthy
in consonant frames. If it cannot, the residual says which phones the six parameters cannot reach
from the coils, which is a statement about the tube.

    python -m fit.mrimap                     fit, report, leave-one-phone-out
    python -m fit.mrimap --save fit/mngu0_map_mri.json
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

from .jointmap import PREDICTOR, Problem as FormantProblem, _simplex
from .mngu0 import MONOPHTHONGS
from .mri_fit import EPS, PREFERRED

REPO = Path(__file__).resolve().parents[2]
POSTURE = REPO / "lab" / "posture.js"
OUT = REPO / "research" / "out"
ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]
N = 49
U_LO, U_HI = 0.12, 0.98

#: engine symbol -> the Combilex labels whose tokens supply its coil mean
GROUPS = {"i": ["i"], "ɪ": ["I"], "ɛ": ["E"], "æ": ["a"], "ʌ": ["V"], "ɑ": ["A"], "ɔ": ["O"], "ʊ": ["U"], "u": ["u"],
          "ɝ": ["@@"], "ə": ["@"], "ɒ": ["Q"],
          "f": ["f"], "θ": ["T"], "s": ["s"], "ʃ": ["S"], "m": ["m", "m!"], "n": ["n", "n!"], "ŋ": ["N"],
          "r": ["r"], "l": ["l", "lw", "l!"], "p": ["p"], "t": ["t"], "k": ["k"]}
VOWELS = [s for s in GROUPS if s in ("i", "ɪ", "ɛ", "æ", "ʌ", "ɑ", "ɔ", "ʊ", "u", "ɝ", "ə", "ɒ")]
#: engine symbol -> Combilex symbol in speaker_formants.csv
FORMANT_KEY = {"i": "i", "ɪ": "I", "ɛ": "E", "æ": "a", "ʌ": "V", "ɑ": "A", "ɔ": "O", "ʊ": "U", "u": "u", "ɝ": "@@", "ə": "@", "ɒ": "Q"}


def node(args: list[str], payload) -> list | dict:
    done = subprocess.run(["node", str(POSTURE), *args], input=json.dumps(payload), capture_output=True,
                          text=True, cwd=REPO, encoding="utf-8")
    if done.returncode != 0:
        raise RuntimeError(done.stderr)
    return json.loads(done.stdout)


def coil_means(tokens: Path) -> pd.DataFrame:
    tok = pd.read_csv(tokens)
    tok = tok[tok.rms_max <= 10].copy()
    tok["lipap"] = tok["UL_y"] - tok["LL_y"]
    cols = sorted(set(PREDICTOR.values()))
    rows = {}
    for sym, labels in GROUPS.items():
        sel = tok[tok.phone.isin(labels)]
        rows[sym] = sel[cols].mean()
        rows[sym]["n"] = len(sel)
    return pd.DataFrame(rows).T


def mri_shapes(profiles: Path) -> dict[str, np.ndarray]:
    P = pd.read_csv(profiles)
    u = np.arange(N) / (N - 1)
    sel = (u >= U_LO) & (u <= U_HI)
    out = {}
    for name, g in P.groupby("prompt", sort=False):
        ipa = g["ipa"].iloc[0]
        if ipa == "rest" or ipa not in GROUPS or (ipa in PREFERRED and PREFERRED[ipa] != name):
            continue
        out[ipa] = np.interp(u[sel], g["u"], g["width_mm"])
    return out


class Problem:
    def __init__(self, coils: pd.DataFrame, shapes: dict[str, np.ndarray], formants: pd.DataFrame,
                 phones: list[str], lam: float, with_formants: bool = True):
        self.coils, self.shapes, self.formants, self.phones, self.lam = coils, shapes, formants, phones, lam
        self.with_formants = with_formants
        u = np.arange(N) / (N - 1)
        self.sel = (u >= U_LO) & (u <= U_HI)
        self.evals = 0
        self.cache: dict[tuple, float] = {}

    def postures(self, x: np.ndarray, phones: list[str] | None = None) -> dict[str, dict[str, float]]:
        m = FormantProblem.unpack(x)
        return {p: {k: m[k][0] + m[k][1] * float(self.coils.loc[p, PREDICTOR[k]]) for k in ARTS}
                for p in (phones or self.phones)}

    def parts(self, x: np.ndarray, phones: list[str] | None = None) -> pd.DataFrame:
        phones = phones or self.phones
        post = self.postures(x, phones)
        clamped = {p: {k: min(1.0, max(0.0, v)) for k, v in A.items()} for p, A in post.items()}
        D = node(["--articulate", "--n", str(N)], clamped)
        vow = [p for p in phones if p in VOWELS and FORMANT_KEY[p] in self.formants.index]
        F = node(["--formants", "--n", str(N)], {p: clamped[p] for p in vow}) if (self.with_formants and vow) else {}
        rows = []
        for p in phones:
            d = np.array(D[p])[self.sel]; w = self.shapes[p]
            dn, wn = d / d.mean(), w / w.mean()
            shape = float(((np.log(dn + EPS) - np.log(wn + EPS)) ** 2).mean())
            r = float(np.corrcoef(d, w)[0, 1]) if d.std() > 0 else np.nan
            du = (np.argmin(d) - np.argmin(w)) / (N - 1) * 17.1
            over = sum(max(0.0, -v) + max(0.0, v - 1.0) for v in post[p].values())
            row = {"phone": p, "shape": shape, "r": r, "du_cm": du, "outside": over}
            if p in F:
                t = self.formants.loc[FORMANT_KEY[p]]
                f = F[p]
                z1 = (f[0] - t.F1) / t.F1_iqr if len(f) > 0 else 6.0
                z2 = (f[1] - t.F2) / t.F2_iqr if len(f) > 1 else 6.0
                row.update({"z1": z1, "z2": z2})
            rows.append(row)
        return pd.DataFrame(rows)

    def score(self, T: pd.DataFrame) -> float:
        shape = self.lam * T["shape"].mean()
        form = float(np.nanmean((T[["z1", "z2"]] ** 2).to_numpy())) if "z1" in T else 0.0
        return shape + form + 25.0 * float((T["outside"] ** 2).sum())

    def __call__(self, x: np.ndarray) -> float:
        key = tuple(np.round(x, 6))
        if key in self.cache:
            return self.cache[key]
        v = self.score(self.parts(x))
        self.evals += 1
        self.cache[key] = v
        return v


def polish(P: Problem, x: np.ndarray, rounds: int = 10) -> np.ndarray:
    step = np.array([0.08, 0.30] * 6); best = P(x)
    for _ in range(rounds):
        moved = False
        for i in range(len(x)):
            for sgn in (1.0, -1.0):
                xt = x.copy(); xt[i] += sgn * step[i]
                f = P(xt)
                if f < best - 1e-6:
                    x, best, moved = xt, f, True
                    break
        if not moved:
            step *= 0.5
            if step[1] < 0.01:
                break
    return x


def fit_from(P: Problem, x0: np.ndarray, maxfev: int) -> np.ndarray:
    res = minimize(P, x0, method="Nelder-Mead",
                   options={"maxfev": maxfev, "xatol": 1e-3, "fatol": 1e-4, "adaptive": True, "initial_simplex": _simplex(x0)})
    return polish(P, res.x)


def _start_worker(job):
    coils, shapes, formants, phones, lam, x0, maxfev, name = job
    P = Problem(coils, shapes, formants, phones, lam)
    x = fit_from(P, x0, maxfev)
    return name, x, P(x), P.evals


def _loo_worker(job):
    coils, shapes, formants, phones, lam, x0, maxfev, held = job
    rest = [p for p in phones if p != held]
    P = Problem(coils, shapes, formants, rest, lam)
    x = fit_from(P, x0, maxfev)
    row = P.parts(x, [held]).iloc[0].to_dict()
    row["evals"] = P.evals
    return row


def starts(coils: pd.DataFrame, phones: list[str]) -> dict[str, np.ndarray]:
    out = {"neutral": FormantProblem.pack({"jaw": (0.5, 0.0), "bodyPos": (0.5, 0.0), "bodyHi": (0.4, 0.0),
                                           "tipPos": (0.84, 0.0), "tipHi": (0.05, 0.0), "lip": (0.6, 0.0)})}
    s0 = REPO / "research" / "fit" / "mngu0_map.json"
    if s0.exists():
        m = json.loads(s0.read_text(encoding="utf-8"))["map"]
        out["stage 0 map"] = FormantProblem.pack({p: (m[p]["intercept"], m[p]["slope"]) for p in ARTS})
    try:
        from .register import PAIRS, engine_postures, fit_map
        vs = [p for p in ["i", "I", "E", "a", "V", "A", "O", "U", "u", "@@", "@"]]
        cm = coils.rename(index={v: k for k, v in FORMANT_KEY.items()})       # back to Combilex keys
        m = fit_map(cm, engine_postures(), vs, PREDICTOR)
        out["ART-fitted map"] = FormantProblem.pack({p: (m[p]["intercept"], m[p]["slope"]) for p in ARTS})
    except Exception as e:                                                  # noqa: BLE001
        print("  (no ART-fitted start:", e, ")")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokens", type=Path, default=OUT / "mngu0_tokens.csv")
    ap.add_argument("--profiles", type=Path, default=OUT / "mri" / "profiles.csv")
    ap.add_argument("--formants", type=Path, default=OUT / "speaker_formants.csv")
    ap.add_argument("--lam", type=float, default=10.0, help="weight on the MRI shape term")
    ap.add_argument("--maxfev", type=int, default=1500)
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--no-loo", action="store_true")
    ap.add_argument("--save", type=Path)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    pd.set_option("display.width", 200)

    coils = coil_means(args.tokens)
    shapes = mri_shapes(args.profiles)
    formants = pd.read_csv(args.formants).set_index("phone")
    phones = [p for p in GROUPS if p in shapes and coils.loc[p, "n"] > 0]
    print(f"{len(phones)} phones with an MRI profile and coil means: {' '.join(phones)}")
    P = Problem(coils, shapes, formants, phones, args.lam)

    S = starts(coils, phones)
    for name, x0 in S.items():
        T = P.parts(x0)
        print(f"  start '{name}': objective {P.score(T):.3f}  (shape {args.lam * T['shape'].mean():.3f}, formant {np.nanmean((T[['z1', 'z2']] ** 2).to_numpy()):.3f})")
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=min(len(S), args.jobs)) as pool:
        results = list(pool.map(_start_worker, [(coils, shapes, formants, phones, args.lam, x0, args.maxfev, name) for name, x0 in S.items()]))
    for name, x, f, ev in results:
        print(f"  from '{name}': objective {f:.3f} after {ev} evaluations")
    name, x, f, _ = min(results, key=lambda r: r[2])
    print(f"  best: from '{name}', {f:.3f}  ({time.time() - t0:.0f} s)")

    m = FormantProblem.unpack(x)
    print("\n=== the MRI-anchored map ===")
    for p in ARTS:
        print(f"  {p:8} {PREDICTOR[p]:7} intercept {m[p][0]:8.3f}  slope/cm {m[p][1]:7.3f}")
    T = P.parts(x)
    print("\n=== per phone: profile r against the MRI, constriction place error, formant z (vowels) ===")
    print(T.round(3).to_string(index=False))
    print(f"\n  median r: vowels {T[T.phone.isin(VOWELS)].r.median():.2f}, consonants {T[~T.phone.isin(VOWELS)].r.median():.2f};"
          f"  median |place error| {T.du_cm.abs().median():.2f} cm;  formant median |z| {np.nanmedian(np.abs(T[['z1', 'z2']].to_numpy())):.2f}")

    result = {"what": "mngu0 s1 coil coordinates -> hollerbox posture, affine, one coil coordinate per parameter, solved "
                      "against the speaker's MRI airway profiles for 24 phones and his vowel formants",
              "sections": N, "lam": args.lam, "phones": phones, "predictor": PREDICTOR,
              "map": {p: {"from": PREDICTOR[p], "intercept": m[p][0], "slope": m[p][1]} for p in ARTS},
              "postures": {p: {k: min(1.0, max(0.0, v)) for k, v in A.items()} for p, A in P.postures(x).items()},
              "coil_means": {p: coils.loc[p].to_dict() for p in phones},
              "fit": T.to_dict(orient="records")}

    if not args.no_loo:
        print(f"\n=== leave-one-phone-out, {args.jobs} in parallel ===")
        t0 = time.time()
        jobs = [(coils, shapes, formants, phones, args.lam, x, args.maxfev // 2, held) for held in phones]
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            rows = list(pool.map(_loo_worker, jobs))
        L = pd.DataFrame(rows)
        print(L.round(3).to_string(index=False))
        print(f"\n  held out: median r vowels {L[L.phone.isin(VOWELS)].r.median():.2f}, consonants {L[~L.phone.isin(VOWELS)].r.median():.2f};"
              f" median |place error| {L.du_cm.abs().median():.2f} cm; formant median |z| {np.nanmedian(np.abs(L[['z1', 'z2']].to_numpy())):.2f}  ({time.time() - t0:.0f} s)")
        result["loo"] = L.to_dict(orient="records")
        L.to_csv(OUT / "mri" / "mrimap_loo.csv", index=False)
    T.to_csv(OUT / "mri" / "mrimap_fit.csv", index=False)

    if args.save:
        args.save.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  saved {args.save}")


if __name__ == "__main__":
    main()
