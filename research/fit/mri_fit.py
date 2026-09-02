"""Postures fitted to the MRI: the tube shape that matches the speaker's airway, phone by phone.

`mri_compare.py` says the engine's consonant places are 1 to 3 cm too far back for /s t l r k/, and
that the speaker-mean consonant targets stage 1 used (the vowel-fitted map extrapolated to
consonants) are worse. This solves for the six posture parameters directly against the MRI width
profile, with no acoustics and no coils in the loop — the geometric target for each phone.

SHAPE, NOT SIZE. A midsagittal width is not an equivalent diameter; they are related by a shape
factor that changes along the tract and is not known. So both profiles are divided by their own mean
over the same stretch of tract and compared as shapes, in a log-ish space that weights the narrow
parts, which is where a consonant lives. The tract's ends are left out as in the comparison.

METHOD. Batched random search through `lab/posture.js` (two thousand postures in one call), then
shrinking-step coordinate descent from the best, also batched. The forward map is the engine's own.

    python -m fit.mri fit      -> out/mri/mri_art.json (engine symbols), a table, mri_fit.png
"""

from __future__ import annotations

import json
import subprocess

import numpy as np
import pandas as pd

from .mri import OUT, REPO
from .mri_compare import ARTS, N, U_HI, U_LO, POSTURE, posture_sources

#: which prompt supplies each engine symbol where the corpus offers more than one
PREFERRED = {"l": "LONG", "k": "K", "ɛ": "PET"}
EPS = 0.08          # in the log comparison, so a closure (0) and a 1 mm gap are distinct but finite


def articulate_many(postures: np.ndarray) -> np.ndarray:
    payload = [dict(zip(ARTS, map(float, row))) for row in postures]
    done = subprocess.run(["node", str(POSTURE), "--articulate", "--n", str(N)], input=json.dumps(payload),
                          capture_output=True, text=True, cwd=REPO, check=True, encoding="utf-8")
    return np.array(json.loads(done.stdout))


def shape_loss(D: np.ndarray, w: np.ndarray, sel: np.ndarray) -> np.ndarray:
    """Per posture: distance between normalised log profiles over the selected sections."""
    d = D[:, sel]
    dn = d / d.mean(axis=1, keepdims=True)
    wn = w / w.mean()
    return ((np.log(dn + EPS) - np.log(wn + EPS)) ** 2).mean(axis=1)


def fit_one(w: np.ndarray, sel: np.ndarray, rng: np.random.Generator, seed_A: dict | None = None) -> tuple[dict, float]:
    cands = rng.random((2000, 6))
    if seed_A is not None:
        cands[0] = [seed_A[k] for k in ARTS]
    L = shape_loss(articulate_many(cands), w, sel)
    x = cands[int(np.argmin(L))].copy(); best = float(L.min())
    step = 0.15
    for _ in range(12):
        trial = np.repeat(x[None, :], 12, axis=0)
        for i in range(6):
            trial[2 * i, i] = np.clip(x[i] + step, 0, 1)
            trial[2 * i + 1, i] = np.clip(x[i] - step, 0, 1)
        L = shape_loss(articulate_many(trial), w, sel)
        k = int(np.argmin(L))
        if L[k] < best - 1e-9:
            x, best = trial[k], float(L[k])
        else:
            step *= 0.5
            if step < 0.004:
                break
    return dict(zip(ARTS, map(float, x))), best


def fit() -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    P = pd.read_csv(OUT / "profiles.csv")
    srcs = posture_sources()
    u = np.arange(N) / (N - 1)
    sel = (u >= U_LO) & (u <= U_HI)
    rng = np.random.default_rng(20260902)
    rows, art, panels = [], {}, []
    for name, g in P.groupby("prompt", sort=False):
        ipa = g["ipa"].iloc[0]
        if ipa == "rest":
            continue
        if ipa in PREFERRED and PREFERRED[ipa] != name:
            continue
        w = np.interp(u[sel], g["u"], g["width_mm"])
        A, loss = fit_one(w, sel, rng, srcs["edinburgh"].get(ipa))
        d = articulate_many(np.array([[A[k] for k in ARTS]]))[0][sel]
        r = float(np.corrcoef(w, d)[0, 1])
        du = (u[sel][int(np.argmin(d))] - u[sel][int(np.argmin(w))]) * 17.1
        prev = srcs["edinburgh"].get(ipa)
        r_prev = np.nan
        if prev is not None:
            dp = articulate_many(np.array([[prev[k] for k in ARTS]]))[0][sel]
            r_prev = float(np.corrcoef(w, dp)[0, 1])
        art[ipa] = {k: round(v, 3) for k, v in A.items()}
        rows.append({"prompt": name, "ipa": ipa, "loss": loss, "r_fitted": r, "du_cm": du, "r_before": r_prev, **art[ipa]})
        panels.append((name, ipa, u[sel], w, d))
        print(f"  {name:8} /{ipa}/  r {r:+.2f} (was {r_prev:+.2f})  constriction off by {du:+.2f} cm   "
              + " ".join(f"{k} {A[k]:.2f}" for k in ARTS), flush=True)
    R = pd.DataFrame(rows)
    R.to_csv(OUT / "mri_fit.csv", index=False)
    json.dump({"what": "postures fitted to the same speaker's static MRI airway profiles, shape only; see fit/mri_fit.py",
               "sections": N, "art": art}, open(OUT / "mri_art.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"\n  median r fitted {R.r_fitted.median():.2f} (before {R.r_before.median():.2f}); median |du| {R.du_cm.abs().median():.2f} cm")
    print(f"  wrote {OUT / 'mri_art.json'}")

    n = len(panels); ncol = 5; nrow = int(np.ceil(n / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(3.4 * ncol, 2.6 * nrow), sharex=True)
    for ax, (name, ipa, uu, w, d) in zip(axes.flat, panels):
        ax.fill_between(uu, 0, w / w.mean(), color="#93a1a8", alpha=0.35)
        ax.plot(uu, w / w.mean(), color="#3a4449", lw=1, label="MRI width / mean")
        ax.plot(uu, d / d.mean(), color="#3f7fd6", lw=1.3, label="fitted tube / mean")
        ax.set_title(f"{name}  /{ipa}/", fontsize=10); ax.tick_params(labelsize=7); ax.set_ylim(0, 3)
    for ax in axes.flat[n:]:
        ax.axis("off")
    axes.flat[0].legend(fontsize=7)
    fig.suptitle("Postures fitted to the MRI, as normalised profiles, glottis (0) to lips (1)", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.97)); fig.savefig(OUT / "mri_fit.png", dpi=80)
