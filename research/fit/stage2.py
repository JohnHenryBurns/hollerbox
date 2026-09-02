"""Stage 2 of RESEARCH.md: is the residual structured?

The residual is what stage 1 left: per frame, the measured tube shape (the coils registered into
the MRI frame and inverted through the tube, `stage1r.py`) minus the model's, over the trusted
sections. Three models with the speaker's own targets, so the residual is about MOVEMENT and not
about where the targets are: the target held flat; pure interpolation between targets; the
critically damped follower at the engine's defaults.

The residual is reduced to one signed number per tract region per frame — the mean residual over
the sections of that region — and regressed on everything linguistic the corpus gives:

    phone                the current segment, and what it is next to (prev, next, as classes)
    pos_in_seg           where in the segment the frame is, 0 to 1, and its square
    pos x neighbour      the within-segment clock crossed with what came before and what comes
                         next — coarticulation, if the residual has any
    stress               whether the syllable is stressed
    seg_dur, rate        the segment's duration and the utterance's phones per second
    in_word, utt_pos     position in the word and in the utterance
    to_pause             seconds to the next silence — phrase-final lengthening lives here
    travel_next/prev     how far, in shape, the next and previous targets are from this one

Nested, so each family's contribution is an increment, and scored by R² on the held-out test
utterances: with 700,000 autocorrelated frames a p-value means nothing and a held-out increment
means what it says. Structure that survives the hold-out is a control principle stated
quantitatively; what the follower absorbs, relative to the flat target, is what the movement law
already accounts for.

    python -m fit.stage2                 build the frame table, fit, report
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

from .mngu0 import filesets
from .stage1 import ARTS, COMBILEX, articulate_batch, defaults
from .stage1r import EPS, N, REGIONS, RCorpus, sections, shape, targets_path
from .stage1r import OUT as S1R

OUT = Path(__file__).resolve().parents[2] / "research" / "out" / "stage2"

#: neighbour classes: coarse enough to estimate, fine enough to carry place
CLASS = {}
for cx, e in COMBILEX.items():
    sym = e if isinstance(e, str) else e[0][0]
    if cx == "#":
        CLASS[cx] = "pause"
    elif cx in ("i", "I", "E", "a", "eI", "aI", "I@", "E@"):
        CLASS[cx] = "V_front"
    elif cx in ("u", "U", "O", "Q", "A", "@U", "aU", "OI", "U@", "o^"):
        CLASS[cx] = "V_back"
    elif cx in ("@", "@@", "V"):
        CLASS[cx] = "V_central"
    elif sym in ("p", "b", "m", "f", "v", "w"):
        CLASS[cx] = "labial"
    elif sym in ("t", "d", "n", "s", "z", "l", "r", "θ", "ð"):
        CLASS[cx] = "alveolar"
    elif sym in ("ʃ", "ʒ", "j"):
        CLASS[cx] = "palatal"
    elif sym in ("k", "g", "ŋ"):
        CLASS[cx] = "velar"
    else:
        CLASS[cx] = "other"


def frame_table(corpus: RCorpus, utts: list[str], models: dict[str, dict | None], jobs: int) -> pd.DataFrame:
    """One row per frame: linguistic columns and the residual per region for each model."""
    idx, us = sections()
    dcols = [f"d_{i}" for i in idx]
    reg_cols = {name: (us >= lo) & (us < hi) for name, lo, hi in REGIONS}
    pri = json.loads((S1R / "phone_priors.json").read_text(encoding="utf-8"))
    prior_shape = {}
    # the shape distance between targets, for "distance to travel"
    phones = sorted(pri)
    PS = shape(articulate_batch(np.array([[pri[p][a] for a in ARTS] for p in phones]), N)[:, idx])
    prior_shape = dict(zip(phones, PS))

    runs = {name: corpus.run(utts, ov, actual=False, jobs=jobs) if ov is not None else None for name, ov in models.items()}
    rows = []
    for utt in utts:
        M = corpus.measured(utt)
        info = corpus.info[utt]; labs = info["labs"]
        meas = shape(M["D"][:, idx])
        n_ph = sum(1 for l in labs if l["ph"] != "#")
        speech = sum(l["b"] - l["a"] for l in labs if l["ph"] != "#")
        rate = n_ph / max(0.1, speech)
        pauses = [l["a"] for l in labs if l["ph"] == "#"]
        # residuals per model, aligned to measured frames
        res = {}
        base = None
        for name, df in runs.items():
            if df is None:                                      # hold prior: the target's shape, per frame
                continue
            g = df[df.utt == utt]
            ai, ok = corpus.align(utt, g)
            D = shape(g[dcols].to_numpy(np.float32)[ok])
            r = np.full((len(meas), len(idx)), np.nan, np.float32)
            r[ai[ok]] = meas[ai[ok]] - D
            res[name] = r
            if base is None:
                base = ai[ok]
        # the flat target's residual, on the same frames
        seg = M["seg"]
        ph = np.array([labs[s]["ph"] for s in seg])
        hold = np.stack([prior_shape.get(p, prior_shape["#"]) for p in ph])
        r = np.full_like(hold, np.nan); r[base] = meas[base] - hold[base]
        res["hold"] = r
        t = M["t"]
        for k in base:
            s = int(seg[k]); l = labs[s]
            cur = l["ph"]; prev = labs[s - 1]["ph"] if s > 0 else "#"; nxt = labs[s + 1]["ph"] if s + 1 < len(labs) else "#"
            dur = l["b"] - l["a"]
            row = {"utt": utt, "t": float(t[k]), "phone": cur, "cls": CLASS.get(cur, "other"),
                   "prev": CLASS.get(prev, "other"), "next": CLASS.get(nxt, "other"),
                   "vowel": bool(M["vowel"][k]), "pos": float(np.clip((t[k] - l["a"]) / max(1e-3, dur), 0, 1)),
                   "stress": int(l["stress"]), "seg_dur": dur, "rate": rate,
                   "in_word": float(l["in_word"]) if l["in_word"] == l["in_word"] else 0.5,
                   "utt_pos": float(t[k] / labs[-1]["b"]),
                   "to_pause": float(min([p - t[k] for p in pauses if p > t[k]] + [3.0])),
                   "travel_next": float(np.abs(prior_shape.get(nxt, prior_shape["#"]) - prior_shape.get(cur, prior_shape["#"])).mean()),
                   "travel_prev": float(np.abs(prior_shape.get(prev, prior_shape["#"]) - prior_shape.get(cur, prior_shape["#"])).mean())}
            for name, r in res.items():
                for reg, cols in reg_cols.items():
                    row[f"res_{name}_{reg}"] = float(np.nanmean(r[k, cols]))
                row[f"res_{name}_all"] = float(np.nanmean(r[k]))
            rows.append(row)
    return pd.DataFrame(rows)


#: nested regressors: each level adds a family
LEVELS = [
    ("phone", "C(phone)"),
    ("+ neighbours", "C(phone) + C(prev) + C(next)"),
    ("+ clock", "C(phone) + C(prev) + C(next) + pos + I(pos**2)"),
    ("+ clock x neighbours", "C(phone) + C(prev) + C(next) + pos + I(pos**2) + pos:C(prev) + pos:C(next) + I(pos**2):C(prev) + I(pos**2):C(next)"),
    ("+ travel", "C(phone) + C(prev) + C(next) + pos + I(pos**2) + pos:C(prev) + pos:C(next) + I(pos**2):C(prev) + I(pos**2):C(next)"
                 " + travel_next + travel_prev + pos:travel_next + pos:travel_prev"),
    ("+ prosody", "C(phone) + C(prev) + C(next) + pos + I(pos**2) + pos:C(prev) + pos:C(next) + I(pos**2):C(prev) + I(pos**2):C(next)"
                  " + travel_next + travel_prev + pos:travel_next + pos:travel_prev"
                  " + stress + seg_dur + rate + in_word + utt_pos + to_pause + stress:pos + seg_dur:pos"),
]


def heldout_r2(train: pd.DataFrame, test: pd.DataFrame, y: str, rhs: str) -> float:
    m = smf.ols(f"{y} ~ {rhs}", data=train).fit()
    pred = m.predict(test)
    yt = test[y].to_numpy()
    ok = np.isfinite(pred) & np.isfinite(yt)
    ss_res = float(((yt[ok] - pred[ok]) ** 2).sum()); ss_tot = float(((yt[ok] - yt[ok].mean()) ** 2).sum())
    return 1 - ss_res / ss_tot


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--train", type=int, default=300)
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--no-boost", action="store_true", help="skip the gradient-boosting ceiling")
    args = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
    pd.set_option("display.width", 220)
    OUT.mkdir(parents=True, exist_ok=True)

    corpus = RCorpus()
    fs = filesets()
    train_u = [u for u in fs["train"] if u in corpus.lines][: args.train]
    test_u = [u for u in fs["test"] if u in corpus.lines]
    corpus.art = targets_path("prior", corpus, train_u)
    dflt = defaults()
    fitted = json.loads((S1R / "fitted_prior.json").read_text(encoding="utf-8"))["params"] if (S1R / "fitted_prior.json").exists() else {**dflt, "artT": 0.0}
    models = {"interp": fitted, "follower": dflt}
    cache = OUT / "frames.parquet"
    if cache.exists() and not args.rebuild:
        F = pd.read_parquet(cache)
    else:
        t0 = time.time()
        F = pd.concat([frame_table(corpus, train_u, models, args.jobs).assign(split="train"),
                       frame_table(corpus, test_u, models, args.jobs).assign(split="test")], ignore_index=True)
        try:
            F.to_parquet(cache)
        except Exception:                                   # noqa: BLE001 — no parquet engine: csv then
            cache = OUT / "frames.csv"; F.to_csv(cache, index=False)
        print(f"frame table: {len(F)} frames from {len(train_u)} train and {len(test_u)} test utterances ({time.time() - t0:.0f} s)")
    F.columns = [c.replace("-", "_") for c in F.columns]          # a hyphen is a minus to the formula parser
    Tr, Te = F[F.split == "train"], F[F.split == "test"]
    print(f"train {len(Tr)} frames, test {len(Te)} frames; vowel share {Tr.vowel.mean():.2f}")

    # the residual's size before anything explains it, per model and region (rms), for scale
    print("\n=== residual rms per model and region (held-out), the thing to be explained ===")
    regs = [r.replace("-", "_") for r, _, _ in REGIONS] + ["all"]
    print(pd.DataFrame({m: [float(np.sqrt(np.nanmean(Te[f"res_{m}_{r}"] ** 2))) for r in regs] for m in ["hold", "interp", "follower"]}, index=regs).round(3).to_string())

    rows = []
    for m in ["hold", "interp", "follower"]:
        for r in regs:
            y = f"res_{m}_{r}"
            row = {"model": m, "region": r}
            for name, rhs in LEVELS:
                row[name] = heldout_r2(Tr, Te, y, rhs)
            rows.append(row)
            print(f"  {m:8} {r:18} " + "  ".join(f"{row[n]:6.3f}" for n, _ in LEVELS), flush=True)
    R = pd.DataFrame(rows)
    print("\n=== held-out R² of the residual explained, nested (columns add a family) ===")
    print(R.round(3).to_string(index=False))
    R.to_csv(OUT / "stage2_r2.csv", index=False)

    # THE NONLINEAR CEILING. The linear terms are an inventory; a boosted tree on the same variables
    # says how much structure those variables carry at all, which bounds what any stated principle
    # could recover from them. Three feature sets: everything; context only (phone, neighbours, the
    # clock, distance to travel); and no neighbours (phone, clock, prosody), so the neighbours'
    # share can be read off.
    if not args.no_boost:
        from sklearn.ensemble import HistGradientBoostingRegressor
        for c in ["phone", "prev", "next"]:
            Tr = Tr.assign(**{c: Tr[c].astype("category")}); Te = Te.assign(**{c: Te[c].astype("category")})
        sets = {"all variables": ["phone", "prev", "next", "pos", "stress", "seg_dur", "rate", "in_word", "utt_pos", "to_pause", "travel_next", "travel_prev"],
                "context only": ["phone", "prev", "next", "pos", "travel_next", "travel_prev"],
                "no neighbours": ["phone", "pos", "stress", "seg_dur", "rate", "in_word", "utt_pos", "to_pause"]}
        brows = []
        for m in ["hold", "interp", "follower"]:
            for r in regs:
                y = f"res_{m}_{r}"; row = {"model": m, "region": r, "linear, full": float(R[(R.model == m) & (R.region == r)][LEVELS[-1][0]].iloc[0])}
                for name, fs in sets.items():
                    g = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.08, max_leaf_nodes=31, categorical_features="from_dtype", random_state=0)
                    g.fit(Tr[fs], Tr[y])
                    p = g.predict(Te[fs]); yt = Te[y].to_numpy()
                    row[f"boosted, {name}"] = 1 - float(((yt - p) ** 2).sum() / ((yt - yt.mean()) ** 2).sum())
                brows.append(row)
                print(f"  boosted {m:8} {r:18} " + "  ".join(f"{v:6.3f}" for k, v in row.items() if k not in ("model", "region")), flush=True)
        B = pd.DataFrame(brows)
        print("\n=== the nonlinear ceiling: held-out R² of the residual, gradient boosting on the same variables ===")
        print(B.round(3).to_string(index=False))
        B.to_csv(OUT / "stage2_boosted.csv", index=False)

    # the largest prosodic effects, from the full model on the overall residual of each model
    print("\n=== prosody coefficients on the overall residual (full model; + means the measured tract is wider than the model's) ===")
    for m in ["hold", "interp", "follower"]:
        fit = smf.ols(f"res_{m}_all ~ {LEVELS[-1][1]}", data=Tr).fit()
        keep = [k for k in fit.params.index if k in ("stress", "seg_dur", "rate", "in_word", "utt_pos", "to_pause", "stress:pos", "seg_dur:pos", "travel_next", "travel_prev", "pos:travel_next", "pos:travel_prev")]
        print(f"  {m}: " + "  ".join(f"{k} {fit.params[k]:+.3f}" for k in keep))
    print(f"\nwrote {OUT / 'stage2_r2.csv'}")


if __name__ == "__main__":
    main()
