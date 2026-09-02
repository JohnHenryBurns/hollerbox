"""Stage 1 in the registered frame: the coils as an airway, no map, consonants included.

`stage1.py` compared the model with the coils READ THROUGH THE STAGE 0 MAP, and the MRI showed
that reading to be right for vowels and wrong for every consonant. `register_mri.py` replaces the
map with geometry: the coils in the MRI's frame, the palate a hard boundary, the airway width at
each roof gridline the distance to a tongue contour through the coils. This runs stage 1 on that
measurement.

WHAT IS COMPARED. Per frame, the measured width profile over the TRUSTED sections — from the
dorsum coil's gridline to the lips, u 0.66 to 0.98, the front third of the tract, which is all
six coils can vouch for — against the tube's diameters over the same sections. Both as normalised
log shapes (divided by their own mean over the region), so the unknown width-to-diameter factor
drops out, as it did for the MRI. The score is the variance of the measured shape explained by
the model's, per region and overall, over ALL frames — consonants are in now, which was the point.

THE BASELINES are the same three, in the same space: the current segment's target held flat, the
speaker's mean measured shape per phone, and per phone given both neighbours. The dynamics are
fitted against the same score.

    python -m fit.stage1r prepare            measured shapes per frame, cached (needs stage1 prepare's seg files)
    python -m fit.stage1r objective          one evaluation
    python -m fit.stage1r fit --targets speaker
    python -m fit.stage1r report
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

from . import mri, register_mri as RM
from .mngu0 import filesets, sensors
from .stage1 import (ARTS, COMBILEX, PARAMS, REPO, VOWELS_CX, Corpus, articulate_batch, defaults,
                     speaker_targets, voice_sections)
from .stage1 import OUT as STAGE1_OUT

OUT = REPO / "research" / "out" / "stage1r"
N = 49
EPS = 0.08


#: The engine's tract and the speaker's are not the same length and do not put the same anatomy at
#: the same fraction of it: the engine seals a /d/ at 0.80 and a /g/ at 0.568 of its tube (STOPS in
#: phonemes.js), the MRI has the alveolar ridge at 0.91 and the velar closure at 0.65. Compared at
#: equal fractions, the tube's ridge meets the speaker's palate and every model fails together, by
#: the same margin — which is how this was found. So engine sections are mapped to MRI positions
#: through the anatomy: glottis to glottis, velum to velum, ridge to ridge, lips to lips.
LANDMARKS_ENGINE = [0.0, 0.568, 0.80, 1.0]
LANDMARKS_MRI = [0.0, 0.65, 0.91, 1.0]


def warp(u_engine: np.ndarray) -> np.ndarray:
    return np.interp(u_engine, LANDMARKS_ENGINE, LANDMARKS_MRI)


def sections() -> tuple[np.ndarray, np.ndarray]:
    """Engine sections whose anatomical position lies in the trusted region, and that position (MRI u)."""
    u = np.arange(N) / (N - 1)
    um = warp(u)
    sel = (um >= RM.TRUSTED[0]) & (um <= 0.98)
    return np.where(sel)[0], um[sel]


def shape(X: np.ndarray) -> np.ndarray:
    """Rows normalised by their own mean, in log: the comparison space."""
    return np.log(X / np.maximum(X.mean(axis=1, keepdims=True), 1e-6) + EPS)


class RCorpus(Corpus):
    """The stage 1 corpus with the registered measurement instead of the map's."""

    def __init__(self, utts=None, art=None):
        super().__init__(utts, art)
        self._w: dict[str, dict] = {}

    def measured(self, utt: str) -> dict:                      # noqa: D401 — same contract as Corpus
        if utt not in self._w:
            z = np.load(OUT / "measured" / f"{utt}.npz")
            self._w[utt] = {k: z[k] for k in z.files}
        return self._w[utt]


def prepare(args) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "measured").mkdir(exist_ok=True)
    reg = RM.load_registration()
    grid = mri.roof_grid()
    ug = grid["s_mm"] / grid["length_mm"]
    idx, us = sections()
    info = json.loads((STAGE1_OUT / "segs.json").read_text(encoding="utf-8"))
    utts = list(info) if not args.limit else list(info)[: args.limit]
    t0 = time.time()
    for k, utt in enumerate(utts):
        S = sensors(utt).interpolate(limit_direction="both")
        Wg = RM.frame_widths(S, reg, grid)                          # (F, G) mm on the roof gridlines
        W = np.stack([np.interp(us, ug, row) for row in Wg]).astype(np.float32)   # (F, trusted sections)
        labs = info[utt]["labs"]
        ends = np.array([l["b"] for l in labs])
        seg = np.clip(np.searchsorted(ends, S["t"].to_numpy(), side="left"), 0, len(labs) - 1)
        ph = np.array([labs[i]["ph"] for i in seg])
        np.savez_compressed(OUT / "measured" / f"{utt}.npz", t=S["t"].to_numpy(np.float32), W=W,
                            seg=seg.astype(np.int16), vowel=np.isin(ph, list(VOWELS_CX)))
        if k % 200 == 0:
            print(f"  {k}/{len(utts)} {utt}  {time.time() - t0:.0f} s", flush=True)
    json.dump({"sections": idx.tolist(), "u": us.tolist(), "trusted": RM.TRUSTED, "registration": reg},
              open(OUT / "sections.json", "w"), indent=1)
    print(f"{len(utts)} utterances; {len(idx)} trusted sections (u {us[0]:.2f}..{us[-1]:.2f}); {time.time() - t0:.0f} s")


# ───────────────────────── the geometric inversion ─────────────────────────
#
# A width profile is not a diameter profile, and comparing a tube target against a measured width
# as a shape scored every model below zero — the tube's shape family and the coil-derived width do
# not share a representation. But the tube CAN represent these widths: fitted per phone over the
# trusted sections the reachable correlation is 0.96, closures where they belong. So each measured
# frame is inverted into the tube's six parameters — the posture whose diameters, over the trusted
# sections, have the measured profile's shape — and stage 1 compares diameters to diameters, as it
# did, with a measurement that now sees a consonant. This is the map the affine reading could not
# be: nonlinear, geometric, and using the tube itself as the only prior.

def phone_priors(corpus: RCorpus, train: list[str], idx: np.ndarray, us: np.ndarray) -> dict[str, dict[str, float]]:
    """A posture per corpus phone, fitted to that phone's median measured profile: the seed."""
    from .mri_fit import fit_one
    acc: dict[str, list[np.ndarray]] = {}
    for u in train:
        M = corpus.measured(u); labs = corpus.info[u]["labs"]
        ph = np.array([labs[s]["ph"] for s in M["seg"]])
        for p in np.unique(ph):
            acc.setdefault(p, []).append(M["W"][ph == p])
    sel = np.zeros(N, bool); sel[idx] = True
    rng = np.random.default_rng(20260902)
    out = {}
    for p, rows in acc.items():
        w = np.median(np.concatenate(rows), axis=0) + 0.3
        out[p], _ = fit_one(w, sel, rng)
    return out


def invert_utterance(W: np.ndarray, seeds: np.ndarray, idx: np.ndarray, rounds: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Postures for every frame: from the seeds, coordinate descent on all frames at once.

    Batched: each round articulates 12 candidates per frame in one call. Parameters the trusted
    sections do not see (the pharynx) stay where the seed put them, which is the phone's own fit.
    """
    from .mri_fit import EPS, articulate_many
    sel = np.zeros(N, bool); sel[idx] = True
    F = len(W)
    w = W + 0.3
    wn = np.log(w / w.mean(axis=1, keepdims=True) + EPS)

    def loss_of(P: np.ndarray) -> np.ndarray:
        D = articulate_many(P)[:, sel]
        dn = np.log(D / D.mean(axis=1, keepdims=True) + EPS)
        return ((dn - np.repeat(wn, len(P) // F, axis=0)) ** 2).mean(axis=1)

    x = seeds.copy()
    best = loss_of(x)
    step = 0.12
    for _ in range(rounds):
        cand = np.repeat(x[:, None, :], 12, axis=1)             # (F, 12, 6)
        for i in range(6):
            cand[:, 2 * i, i] = np.clip(x[:, i] + step, 0, 1)
            cand[:, 2 * i + 1, i] = np.clip(x[:, i] - step, 0, 1)
        L = loss_of(cand.reshape(-1, 6)).reshape(F, 12)
        k = L.argmin(axis=1)
        better = L[np.arange(F), k] < best - 1e-9
        x[better] = cand[np.arange(F), k][better]
        best = np.where(better, L[np.arange(F), k], best)
        if not better.any():
            step *= 0.5
    D = articulate_many(x)
    return x, D


def invert(args) -> None:
    corpus = RCorpus()
    idx, us = sections()
    train = [u for u in filesets()["train"] if u in corpus.lines][:300]
    t0 = time.time()
    pri = phone_priors(corpus, train, idx, us)
    json.dump(pri, open(OUT / "phone_priors.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"priors for {len(pri)} phones ({time.time() - t0:.0f} s)", flush=True)
    utts = corpus.utts if not args.limit else corpus.utts[: args.limit]
    from concurrent.futures import ProcessPoolExecutor
    jobs = [(u, args.rounds) for u in utts]
    done = 0
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        for u in pool.map(_invert_one, jobs, chunksize=4):
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(utts)} {u}  {time.time() - t0:.0f} s", flush=True)
    print(f"inverted {len(utts)} utterances in {time.time() - t0:.0f} s")


def _invert_one(job) -> str:
    """One utterance, in a worker: seeds from the phone priors, then the batched descent."""
    u, rounds = job
    corpus = RCorpus([u])
    pri = json.loads((OUT / "phone_priors.json").read_text(encoding="utf-8"))
    idx, _ = sections()
    M = corpus.measured(u); labs = corpus.info[u]["labs"]
    seeds = np.array([[pri.get(labs[s]["ph"], pri["#"])[a] for a in ARTS] for s in M["seg"]])
    A, D = invert_utterance(M["W"], seeds, idx, rounds=rounds)
    np.savez_compressed(OUT / "measured" / f"{u}.npz", t=M["t"], W=M["W"], seg=M["seg"], vowel=M["vowel"],
                        A=A.astype(np.float32), D=D.astype(np.float32))
    return u


def frame_score(corpus: RCorpus, df: pd.DataFrame, idx: np.ndarray) -> tuple[float, float, int]:
    """RMS shape distance over the trusted sections: vowel frames, all frames."""
    dcols = [f"d_{i}" for i in idx]
    ss_v = ss_a = 0.0; n_v = n_a = 0
    for utt, g in df.groupby("utt", sort=False):
        ai, ok = corpus.align(utt, g)
        M = corpus.measured(utt)
        # both sides as normalised log shapes: the inversion fitted shapes, so its absolute level is arbitrary
        D = shape(g[dcols].to_numpy(np.float32)[ok])
        Dm = shape(M["D"][ai[ok]][:, idx])
        vow = M["vowel"][ai[ok]]
        e = ((D - Dm) ** 2).sum(axis=1)
        ss_a += float(e.sum()); n_a += e.size * len(idx)
        ss_v += float(e[vow].sum()); n_v += int(vow.sum()) * len(idx)
    return np.sqrt(ss_v / max(1, n_v)), np.sqrt(ss_a / max(1, n_a)), n_a // len(idx)


def objective(corpus: RCorpus, utts, overrides, jobs, idx) -> tuple[float, float, int]:
    df = corpus.run(utts, overrides, actual=False, jobs=jobs)
    return frame_score(corpus, df, idx)


def fit(args) -> None:
    corpus = RCorpus()
    fs = filesets()
    train = [u for u in fs["train"] if u in corpus.lines][: args.train]
    if args.targets != "engine":
        corpus.art = targets_path(args.targets, corpus, [u for u in fs["train"] if u in corpus.lines][:300])
    idx, _ = sections()
    x = defaults()
    names = list(PARAMS)
    step = {k: (PARAMS[k][1] - PARAMS[k][0]) * 0.15 for k in names}
    t0 = time.time()
    _, best, nf = objective(corpus, train, x, args.jobs, idx)
    print(f"{len(train)} training utterances, {nf} frames; defaults {x}\n  start: all-frame shape distance {best:.4f}  ({time.time() - t0:.0f} s an evaluation)", flush=True)
    for r in range(args.rounds):
        moved = False
        for k in names:
            for sgn in (+1, -1):
                xt = dict(x); xt[k] = float(np.clip(x[k] + sgn * step[k], *PARAMS[k]))
                if xt[k] == x[k]:
                    continue
                _, f, _ = objective(corpus, train, xt, args.jobs, idx)
                if f < best - 1e-6:
                    x, best, moved = xt, f, True
                    print(f"  round {r + 1}: {k} -> {x[k]:.4f}   {best:.4f}", flush=True)
                    break
        if not moved:
            for k in names:
                step[k] *= 0.5
            print(f"  round {r + 1}: no move, steps halved", flush=True)
        if step["artT"] < 0.0005:
            break
    (OUT / f"fitted_{args.targets}.json").write_text(json.dumps({"params": x, "train": train, "score": best, "targets": args.targets}, indent=1), encoding="utf-8")
    print(f"\nfitted {x}\n  score {best:.4f}  ({time.time() - t0:.0f} s)")


def targets_path(which: str, corpus: RCorpus, train: list[str]) -> Path | None:
    """The same target sets as stage1: speaker (from the map's measured postures, stage 1's file), MRI."""
    if which == "engine":
        return None
    if which == "speaker":
        p = STAGE1_OUT / "speaker_art.json"
        if not p.exists():
            speaker_targets(Corpus(), train, p)
        return p
    from .stage1 import MRI_ART, VOWEL_SYMBOLS
    if which == "prior":
        # the speaker's own per-phone posture in THIS measurement: the phone priors the inversion was
        # seeded from, fitted to each phone's median registered profile over the training set. The
        # analogue of stage 1's "speaker" targets, now with consonants that close.
        pri = json.loads((OUT / "phone_priors.json").read_text(encoding="utf-8"))
        art = {}
        for cx, A in pri.items():
            e = COMBILEX.get(cx)
            if isinstance(e, str) and e not in (" ", "eɪ", "aɪ", "ɔɪ", "aʊ", "oʊ") and e not in art:
                art[e] = A
        dest = OUT / "prior_art.json"
        dest.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
        return dest
    if which in ("mri-cons", "mri-all") and MRI_ART.exists():
        art = json.loads(MRI_ART.read_text(encoding="utf-8"))["art"]
        if which == "mri-cons":
            art = {k: v for k, v in art.items() if k not in VOWEL_SYMBOLS}
        dest = OUT / f"{which}_art.json"
        dest.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
        return dest
    return None


REGIONS = [("velar-palatal", 0.66, 0.78), ("palatal-alveolar", 0.78, 0.88), ("alveolar", 0.88, 0.93), ("lips", 0.93, 0.99)]


def r2_regions(Wm: np.ndarray, Dm: np.ndarray, us: np.ndarray) -> dict[str, float]:
    out = {}
    for name, lo, hi in REGIONS + [("all", 0.0, 1.0)]:
        cols = (us >= lo) & (us < hi)
        y, yhat = Wm[:, cols].ravel(), Dm[:, cols].ravel()
        ss_res = float(((y - yhat) ** 2).sum()); ss_tot = float(((y - y.mean()) ** 2).sum())
        out[name] = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    # and the softer number: the mean per-frame correlation of the two shapes, which forgives a
    # constant offset between two representations that R² does not
    a = Wm - Wm.mean(axis=1, keepdims=True); b = Dm - Dm.mean(axis=1, keepdims=True)
    r = (a * b).sum(axis=1) / (np.sqrt((a ** 2).sum(axis=1) * (b ** 2).sum(axis=1)) + 1e-9)
    out["frame r"] = float(np.nanmean(r))
    return out


def report(args) -> None:
    corpus = RCorpus()
    fs = filesets()
    test = [u for u in fs["test"] if u in corpus.lines]
    train = [u for u in fs["train"] if u in corpus.lines][: args.train]
    idx, us = sections()
    dcols = [f"d_{i}" for i in idx]
    dflt = defaults()
    fitted = {t: json.loads((OUT / f"fitted_{t}.json").read_text(encoding="utf-8"))["params"]
              for t in ("engine", "speaker", "prior", "mri-cons", "mri-all") if (OUT / f"fitted_{t}.json").exists()}
    models = {}
    for tset in ("engine", "speaker", "prior", "mri-cons", "mri-all"):
        path = targets_path(tset, corpus, train)
        if tset != "engine" and path is None:
            continue
        models[f"{tset} · defaults"] = (path, dflt)
        if tset in ("engine", "speaker", "prior"):
            models[f"{tset} · no-mass"] = (path, {**dflt, "artT": 0.0})
        if tset in fitted:
            models[f"{tset} · fitted"] = (path, fitted[tset])
        elif "prior" in fitted:
            models[f"{tset} · prior-fitted params"] = (path, fitted["prior"])

    # the measured (inverted) diameters of the test frames over the trusted sections, and the bookkeeping
    tables = {}
    meas = None
    for name, (artp, ov) in models.items():
        corpus.art = artp
        t0 = time.time()
        df = corpus.run(test, ov, actual=False, jobs=args.jobs)
        rows_D, rows_W, keys = [], [], []
        for utt, g in df.groupby("utt", sort=False):
            ai, ok = corpus.align(utt, g)
            M = corpus.measured(utt)
            rows_D.append(shape(g[dcols].to_numpy(np.float32)[ok]))
            if meas is None:
                rows_W.append(shape(M["D"][ai[ok]][:, idx]))
                labs = corpus.info[utt]["labs"]
                seg = M["seg"][ai[ok]]
                keys.append(pd.DataFrame({"utt": utt, "seg": seg, "phone": [labs[s]["ph"] for s in seg], "vowel": M["vowel"][ai[ok]]}))
        tables[name] = np.concatenate(rows_D)
        if meas is None:
            meas = np.concatenate(rows_W); K = pd.concat(keys, ignore_index=True)
        print(f"  {name}: {len(tables[name])} frames on {len(test)} held-out utterances ({time.time() - t0:.0f} s)", flush=True)
    corpus.art = None

    # static baselines in the same space: the mean measured diameters per phone and per context, from train
    def ctx_key(labs, s):
        return (labs[s - 1]["ph"] if s > 0 else "#", labs[s]["ph"], labs[s + 1]["ph"] if s + 1 < len(labs) else "#")
    acc_p, acc_c = {}, {}
    for u in train:
        M = corpus.measured(u); labs = corpus.info[u]["labs"]
        Wm = shape(M["D"][:, idx])
        for s in np.unique(M["seg"]):
            rows = Wm[M["seg"] == s]
            acc_p.setdefault(labs[s]["ph"], []).append(rows)
            k = ctx_key(labs, s)
            for kk in (k, (k[0], k[1], None), (None, k[1], k[2])):
                acc_c.setdefault(kk, []).append(rows)
    mean_p = {p: np.concatenate(v).mean(axis=0) for p, v in acc_p.items()}
    mean_c = {k: np.concatenate(v).mean(axis=0) for k, v in acc_c.items()}
    grand = np.mean(list(mean_p.values()), axis=0)
    pm = np.stack([mean_p.get(p, grand) for p in K["phone"]])
    cm = []
    for u, s in zip(K["utt"], K["seg"]):
        labs = corpus.info[u]["labs"]; k = ctx_key(labs, int(s))
        for kk in (k, (k[0], k[1], None), (None, k[1], k[2])):
            if kk in mean_c:
                cm.append(mean_c[kk]); break
        else:
            cm.append(mean_p.get(k[1], grand))
    cm = np.stack(cm)
    # hold the engine's target: the Edinburgh table's posture per phone, articulated, as a shape
    art = json.loads(__import__("subprocess").run(["node", "-e",
        "const P=require('./engine/phonemes.js');console.log(JSON.stringify({...P.ART,...(P.VOICES.mngu0.art||{})}))"],
        capture_output=True, text=True, cwd=REPO, check=True, encoding="utf-8").stdout)
    def target_of(ph):
        e = COMBILEX.get(ph, "ə"); e = e[-1][0] if isinstance(e, list) else e
        e = {"eɪ": "ɛ", "aɪ": "ɑ", "ɔɪ": "ɔ", "aʊ": "ɑ", "oʊ": "o", " ": "ə"}.get(e, e)
        return art.get(e, art["ə"])
    phones = sorted(set(K["phone"]))
    hold_D = dict(zip(phones, shape(articulate_batch(np.array([[target_of(p)[k] for k in ARTS] for p in phones]), N)[:, idx])))
    hold = np.stack([hold_D[p] for p in K["phone"]])
    # and the prior targets held flat: the static baseline the dynamic model with prior targets is to beat
    pri = json.loads((OUT / "phone_priors.json").read_text(encoding="utf-8"))
    prior_D = dict(zip(phones, shape(articulate_batch(np.array([[pri.get(p, pri["#"])[k] for k in ARTS] for p in phones]), N)[:, idx])))
    hold_prior = np.stack([prior_D[p] for p in K["phone"]])

    pd.set_option("display.width", 220)
    rows = []
    for frames, mask in [("vowel frames", K["vowel"].to_numpy()), ("consonant frames", ~K["vowel"].to_numpy()), ("all frames", np.ones(len(K), bool))]:
        rows.append({"model": "hold target", "frames": frames, **r2_regions(meas[mask], hold[mask], us)})
        rows.append({"model": "hold prior", "frames": frames, **r2_regions(meas[mask], hold_prior[mask], us)})
        rows.append({"model": "phone mean (train)", "frames": frames, **r2_regions(meas[mask], pm[mask], us)})
        rows.append({"model": "context mean (train)", "frames": frames, **r2_regions(meas[mask], cm[mask], us)})
        for name, D in tables.items():
            rows.append({"model": name, "frames": frames, **r2_regions(meas[mask], D[mask], us)})
    R = pd.DataFrame(rows)
    print("\n=== variance explained, DIAMETER space over the trusted sections (MRI u 0.66–0.98, the front third),"
          " measurement = coils registered into the MRI frame and inverted through the tube; held-out test set ===")
    print(R.round(3).to_string(index=False))
    R.to_csv(OUT / "stage1r_r2.csv", index=False)
    print(f"\nwrote {OUT / 'stage1r_r2.csv'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare"); p.add_argument("--limit", type=int)
    p = sub.add_parser("invert"); p.add_argument("--limit", type=int); p.add_argument("--rounds", type=int, default=8)
    p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    p = sub.add_parser("objective"); p.add_argument("--train", type=int, default=60); p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    p.add_argument("--set", default=""); p.add_argument("--targets", default="engine")
    p = sub.add_parser("fit"); p.add_argument("--train", type=int, default=120); p.add_argument("--rounds", type=int, default=10)
    p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2)); p.add_argument("--targets", default="speaker")
    p = sub.add_parser("report"); p.add_argument("--train", type=int, default=300); p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    args = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
    if args.cmd == "prepare":
        prepare(args)
    elif args.cmd == "invert":
        invert(args)
    elif args.cmd == "objective":
        corpus = RCorpus()
        train = [u for u in filesets()["train"] if u in corpus.lines][: args.train]
        if args.targets != "engine":
            corpus.art = targets_path(args.targets, corpus, train)
        ov = defaults()
        for kv in filter(None, args.set.split(",")):
            k, v = kv.split("="); ov[k] = float(v)
        idx, _ = sections()
        t0 = time.time()
        sv, sa, nf = objective(corpus, train, ov, args.jobs, idx)
        print(f"{len(train)} utterances, {nf} frames: shape distance {sv:.4f} (vowel frames), {sa:.4f} (all)  in {time.time() - t0:.1f} s  {ov}")
    elif args.cmd == "fit":
        fit(args)
    elif args.cmd == "report":
        report(args)


if __name__ == "__main__":
    main()
