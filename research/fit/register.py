"""Stage 0 of RESEARCH.md: can measured coil positions be read as engine postures at all?

THE QUESTION, restated so the answer cannot drift. The engine has six posture parameters. The
corpus has six coils in the midsagittal plane. Stage 0 asks whether a map from the second to the
first exists such that the engine's OWN vowel postures land where the corpus says the speaker's
articulators were, to within the corpus's own token-to-token scatter. If it does not, everything
downstream compares two things that are not the same thing, and stops.

THE MAP IS DELIBERATELY RIGID. RESEARCH.md names the failure mode: with enough freedom the
registration absorbs exactly the structure stage 2 is looking for. So each engine parameter is an
affine function of ONE coil coordinate, chosen by what the parameter physically is, before any
number was looked at:

    jaw      <-  JAW_y              the jaw coil's height
    bodyPos  <-  T2_x               where the tongue-body coil sits along the front-back axis
    bodyHi   <-  T2_y               how high it is
    tipPos   <-  T1_x               the tip coil, likewise
    tipHi    <-  T1_y
    lip      <-  UL_y - LL_y        lip aperture

Twelve numbers in total, fitted on eleven vowel means. There is nothing in it that can bend to a
particular vowel. The T3 (dorsum) coil is reported as a sensitivity check for the body pair and is
not in the map.

WHAT IS COMPARED. The engine's postures were solved against Peterson & Barney's American formant
data; the speaker is British RP with a TRAP/BATH merger. So this is a cross-dialect comparison and
the vowels where the two dialects are known to differ — fronted GOOSE, non-rhotic NURSE — are
expected to miss, and if the map is real they should be the ones that miss. That is a check on the
map, not a nuisance, and it is reported per vowel rather than averaged away.

THE TEST is leave-one-vowel-out. Each vowel's posture is predicted from a map fitted on the other
ten and from that vowel's mean coil vector; the miss is expressed in units of the per-token scatter
the same map would produce (|slope| x the coil's SD within that vowel), which is the kill
criterion's own yardstick. Both postures are then pushed through `articulate` and the tract's
transfer function via `lab/posture.js`, so the miss is also reported in diameter and in Hz — the
comment on `artCrit` in phonemes.js records why: 0.426 of diameter undershoot in the wide parts of
the tract sounded like a catastrophe and was 1.6% of formant error.

    python -m fit.register                       fit, test, and print the tables
    python -m fit.register --min-dur 0.06        only tokens at least 60 ms long (less undershoot)
    python -m fit.register --save fit/mngu0_map.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from .mngu0 import MONOPHTHONGS

REPO = Path(__file__).resolve().parents[2]
POSTURE = REPO / "lab" / "posture.js"
TOKENS = REPO / "research" / "out" / "mngu0_tokens.csv"

ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]

#: engine parameter -> the one coil coordinate it is read from. Declared, not searched.
PREDICTOR = {"jaw": "JAW_y", "bodyPos": "T2_x", "bodyHi": "T2_y",
             "tipPos": "T1_x", "tipHi": "T1_y", "lip": "lipap"}
#: the dorsum coil as an alternative body reading, for the sensitivity line only
ALT_BODY = {"bodyPos": "T3_x", "bodyHi": "T3_y"}

#: Combilex symbol -> engine symbol. Q (LOT, ɒ) has no engine counterpart and is carried through
#: for prediction only. The @@ <-> ɝ pair is rhotic against non-rhotic and is expected to miss.
PAIRS = {"i": "i", "I": "ɪ", "E": "ɛ", "a": "æ", "V": "ʌ", "A": "ɑ",
         "O": "ɔ", "U": "ʊ", "u": "u", "@@": "ɝ", "@": "ə"}
#: known dialect mismatches, flagged in the table rather than dropped from the fit
DIALECT = {"u": "RP GOOSE is fronted; the engine's /u/ is back", "@@": "RP NURSE is non-rhotic; the engine's is r-coloured"}


def node(args: list[str], payload) -> dict | list:
    done = subprocess.run(["node", str(POSTURE), *args], input=json.dumps(payload),
                          capture_output=True, text=True, cwd=REPO, encoding="utf-8")
    if done.returncode != 0:
        raise RuntimeError(f"posture.js failed: {done.stderr.strip()}")
    if done.stderr.strip():
        print("  posture.js:", done.stderr.strip())
    return json.loads(done.stdout)


def engine_postures() -> dict[str, dict[str, float]]:
    """The engine's own posture table, read from the engine rather than copied."""
    done = subprocess.run(["node", str(POSTURE), "--art"], capture_output=True, text=True,
                          cwd=REPO, encoding="utf-8", check=True)
    return json.loads(done.stdout)["art"]


def vowel_table(tok: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Per-vowel mean and SD of every predictor, from the token table."""
    v = tok[tok.phone.isin(MONOPHTHONGS)].copy()
    v["lipap"] = v["UL_y"] - v["LL_y"]
    cols = sorted(set(PREDICTOR.values()) | set(ALT_BODY.values()))
    g = v.groupby("phone")
    mean, sd = g[cols].mean(), g[cols].std()
    mean["n"] = g.size()
    return mean, sd


def fit_affine(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """y = a + b x, least squares. Two numbers; nothing to overfit with."""
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


def fit_map(mean: pd.DataFrame, art: dict, vowels: list[str],
            predictor: dict[str, str] = PREDICTOR) -> dict[str, dict]:
    out = {}
    for p in ARTS:
        col = predictor[p]
        x = np.array([mean.loc[c, col] for c in vowels])
        y = np.array([art[PAIRS[c]][p] for c in vowels])
        a, b = fit_affine(x, y)
        pred = a + b * x
        ss = float(((y - pred) ** 2).sum()); st = float(((y - y.mean()) ** 2).sum())
        out[p] = {"from": col, "intercept": a, "slope": b,
                  "r2": 1 - ss / st if st > 0 else float("nan"),
                  "resid_sd": float(np.sqrt(ss / max(1, len(y) - 2)))}
    return out


def apply_map(m: dict, row: pd.Series) -> dict[str, float]:
    return {p: float(m[p]["intercept"] + m[p]["slope"] * row[m[p]["from"]]) for p in ARTS}


def leave_one_out(mean: pd.DataFrame, sd: pd.DataFrame, art: dict, vowels: list[str],
                  predictor: dict[str, str] = PREDICTOR) -> pd.DataFrame:
    rows = []
    for held in vowels:
        rest = [c for c in vowels if c != held]
        m = fit_map(mean, art, rest, predictor)
        pred = apply_map(m, mean.loc[held])
        for p in ARTS:
            col = predictor[p]
            scatter = abs(m[p]["slope"]) * sd.loc[held, col]      # one token-SD, in posture units
            miss = pred[p] - art[PAIRS[held]][p]
            rows.append({"vowel": held, "engine": PAIRS[held], "param": p, "from": col,
                         "engine_value": art[PAIRS[held]][p], "predicted": pred[p],
                         "miss": miss, "token_sd": scatter,
                         "z": miss / scatter if scatter > 0 else float("nan")})
    return pd.DataFrame(rows)


def acoustic(art: dict, predicted: dict[str, dict[str, float]], n: int = 44) -> pd.DataFrame:
    """Diameter and formant distance between the engine's posture and the registered one."""
    ids = list(predicted)
    both = {}
    for c in ids:
        both[f"{c}|engine"] = art[PAIRS[c]] if c in PAIRS else None
        both[f"{c}|reg"] = predicted[c]
    both = {k: v for k, v in both.items() if v is not None}
    diam = node(["--articulate", "--n", str(n)], both)
    form = node(["--formants", "--n", str(n)], both)
    rows = []
    for c in ids:
        e, r = f"{c}|engine", f"{c}|reg"
        if e not in diam:
            rows.append({"vowel": c, "F1_reg": form[r][0] if len(form[r]) > 0 else np.nan,
                         "F2_reg": form[r][1] if len(form[r]) > 1 else np.nan})
            continue
        de, dr = np.array(diam[e]), np.array(diam[r])
        fe, fr = form[e], form[r]
        row = {"vowel": c, "engine": PAIRS[c],
               "diam_rms": float(np.sqrt(((de - dr) ** 2).mean())),
               "diam_max": float(np.abs(de - dr).max())}
        for k, name in enumerate(["F1", "F2", "F3"]):
            row[f"{name}_eng"] = fe[k] if k < len(fe) else np.nan
            row[f"{name}_reg"] = fr[k] if k < len(fr) else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokens", type=Path, default=TOKENS)
    ap.add_argument("--min-dur", type=float, default=0.0, help="drop tokens shorter than this (s)")
    ap.add_argument("--max-rms", type=float, default=10.0, help="drop tokens whose worst coil rms exceeds this")
    ap.add_argument("--save", type=Path, help="write the fitted map (all eleven vowels) as JSON")
    args = ap.parse_args()

    pd.set_option("display.width", 200); pd.set_option("display.max_columns", 30)
    tok = pd.read_csv(args.tokens)
    n0 = len(tok)
    tok = tok[(tok.dur >= args.min_dur) & (tok.rms_max <= args.max_rms)]
    print(f"{len(tok)} of {n0} tokens kept (min_dur {args.min_dur}, max_rms {args.max_rms})")

    mean, sd = vowel_table(tok)
    art = engine_postures()
    vowels = [c for c in PAIRS if c in mean.index]
    print(f"\n{len(vowels)} vowel pairs: " + "  ".join(f"{c}->{PAIRS[c]}" for c in vowels))

    # ---- the map, fitted on everything, for the record ----
    m = fit_map(mean, art, vowels)
    print("\n=== the map, fitted on all eleven vowel means ===")
    print(f"  {'param':8} {'from':7} {'slope':>9} {'intercept':>10} {'R2':>6} {'resid_sd':>9}")
    for p in ARTS:
        r = m[p]
        print(f"  {p:8} {r['from']:7} {r['slope']:9.3f} {r['intercept']:10.3f} {r['r2']:6.2f} {r['resid_sd']:9.3f}")
    alt = fit_map(mean, art, vowels, {**PREDICTOR, **ALT_BODY})
    print("  sensitivity, body read from the dorsum coil instead:")
    for p in ALT_BODY:
        r = alt[p]
        print(f"  {p:8} {r['from']:7} {r['slope']:9.3f} {r['intercept']:10.3f} {r['r2']:6.2f} {r['resid_sd']:9.3f}")

    # ---- leave one vowel out ----
    loo = leave_one_out(mean, sd, art, vowels)
    print("\n=== leave-one-vowel-out: miss in units of one token-SD (the kill criterion's yardstick) ===")
    z = loo.pivot(index="vowel", columns="param", values="z").loc[vowels, ARTS]
    z["worst"] = z.abs().max(axis=1)
    z["note"] = [DIALECT.get(c, "") for c in z.index]
    print(z.round(2).to_string())
    print(f"\n  |z| <= 1 in {(loo.z.abs() <= 1).mean() * 100:.0f}% of parameter-vowel cells,"
          f" <= 2 in {(loo.z.abs() <= 2).mean() * 100:.0f}%; median |z| {loo.z.abs().median():.2f}")
    core = loo[~loo.vowel.isin(DIALECT)]
    print(f"  excluding the two known dialect mismatches: <= 1 in {(core.z.abs() <= 1).mean() * 100:.0f}%,"
          f" <= 2 in {(core.z.abs() <= 2).mean() * 100:.0f}%; median |z| {core.z.abs().median():.2f}")

    print("\n=== the same, as raw posture units (engine value / predicted) ===")
    ev = loo.pivot(index="vowel", columns="param", values="engine_value").loc[vowels, ARTS]
    pv = loo.pivot(index="vowel", columns="param", values="predicted").loc[vowels, ARTS]
    show = pd.concat({"engine": ev, "registered": pv}, axis=1).swaplevel(axis=1).sort_index(axis=1, level=0)
    print(show.round(3).to_string())

    # ---- what the miss costs acoustically ----
    predicted = {c: apply_map(fit_map(mean, art, [v for v in vowels if v != c]), mean.loc[c]) for c in vowels}
    if "Q" in mean.index:
        predicted["Q"] = apply_map(m, mean.loc["Q"])
    ac = acoustic(art, predicted)
    print("\n=== forward-mapped: diameter and formant distance between the engine posture and the registered one ===")
    print(ac.round(3).to_string(index=False))
    ok = ac.dropna(subset=["F1_eng"])
    for f in ["F1", "F2"]:
        d = (ok[f"{f}_reg"] - ok[f"{f}_eng"]).abs()
        rel = d / ok[f"{f}_eng"]
        print(f"  {f}: median |diff| {d.median():.0f} Hz ({rel.median() * 100:.1f}%), worst {d.max():.0f} Hz on {ok.loc[d.idxmax(), 'vowel']}")

    # ---- which side is wrong? ----
    # Correlations across the eleven vowel means between every engine parameter and every coil
    # coordinate. If a parameter is the anatomical thing its name says, it correlates with that
    # coil and not with the others. The best-coordinate search below can only flatter the map.
    coilcols = ["T1_x", "T1_y", "T2_x", "T2_y", "T3_x", "T3_y", "JAW_y", "UL_y", "LL_y", "lipap"]
    v = tok[tok.phone.isin(vowels)].copy()
    v["lipap"] = v["UL_y"] - v["LL_y"]
    C = v.groupby("phone")[coilcols].mean().loc[vowels]
    E = pd.DataFrame({p: [art[PAIRS[c]][p] for c in vowels] for p in ARTS}, index=vowels)
    print("\n=== Pearson r across the vowel means: engine parameter (rows) vs coil coordinate (cols) ===")
    R = pd.DataFrame({k: [np.corrcoef(E[p], C[k])[0, 1] for p in ARTS] for k in coilcols}, index=ARTS)
    print(R.round(2).to_string())
    print("  declared coordinate's r:", "  ".join(f"{p} {R.loc[p, PREDICTOR[p]]:+.2f}" for p in ARTS))
    print("  best-correlated coordinate:", "  ".join(f"{p} {R.loc[p].abs().idxmax()} {R.loc[p].abs().max():.2f}" for p in ARTS))

    out = REPO / "research" / "out"
    out.mkdir(exist_ok=True)
    loo.to_csv(out / "stage0_loo.csv", index=False)
    ac.to_csv(out / "stage0_acoustic.csv", index=False)
    print(f"\nwrote {out / 'stage0_loo.csv'} and {out / 'stage0_acoustic.csv'}")

    if args.save:
        payload = {"what": "mngu0 speaker 1 coil coordinates -> hollerbox posture parameters, affine, one coil coordinate each",
                   "fitted_on": {"vowels": vowels, "tokens": int(len(tok)), "min_dur": args.min_dur, "max_rms": args.max_rms,
                                 "corpus": "mngu0_s1_ema_basic_1.1.0 + mngu0_s1_lab_1.1.1", "engine_postures": "engine/phonemes.js ART"},
                   "units": "coil coordinates in cm, x positive toward the back, y positive up; lipap = UL_y - LL_y",
                   "map": m,
                   "vowel_means": {c: {k: float(mean.loc[c, k]) for k in sorted(set(PREDICTOR.values()))} for c in mean.index},
                   "rule": "fixed before stage 1 and never refitted afterwards (RESEARCH.md, 'The mapping absorbs the finding')"}
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"saved the map to {args.save}")


if __name__ == "__main__":
    main()
