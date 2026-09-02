"""The engine's postures against the same speaker's MRI, phone by phone.

Three posture sources, each pushed through `articulate` at the Edinburgh voice's 49 sections:

  engine     the shared `ART` table — Peterson & Barney American vowels, hand-solved consonants
  edinburgh  the voice as shipped: the speaker's vowels through the stage 0 map, shared consonants
  speaker    his mean measured posture for every phone (stage 1's `speaker_art.json`), which for a
             consonant is the map's linear extrapolation from vowels and never closes

Against them, the midsagittal airway width read off the static MRI (`fit/mri.py`). A width is not a
diameter, so three things are compared that do not depend on the shape factor between them: the
POSITION of the tightest point along the tract (as a fraction of its length, and in centimetres),
the profile CORRELATION along the tract, and how the tightest point compares to the rest of the
tract (min over mean). The larynx end (u < 0.12) is left out — the walk ends in the laryngeal
vestibule, which the engine does not model — and so is the last 2% at the lips, where teeth are as
dark as air.

    python -m fit.mri compare      -> out/mri/compare.csv, out/mri/compare.png, a table
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from .mri import OUT, PROMPT_IPA, REPO

POSTURE = REPO / "lab" / "posture.js"
SPEAKER_ART = REPO / "research" / "out" / "stage1" / "speaker_art.json"
ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]
U_LO, U_HI = 0.12, 0.98
N = 49


def posture_sources() -> dict[str, dict[str, dict]]:
    js = ("const P=require('./engine/phonemes.js');"
          "console.log(JSON.stringify({engine:P.ART, edinburgh:{...P.ART, ...(P.VOICES.mngu0.art||{})}}))")
    src = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, cwd=REPO,
                                    check=True, encoding="utf-8").stdout)
    if SPEAKER_ART.exists():
        spk = json.loads(SPEAKER_ART.read_text(encoding="utf-8"))
        src["speaker"] = {**src["edinburgh"], **spk}
    return src


def articulate(postures: dict[str, dict]) -> dict[str, np.ndarray]:
    done = subprocess.run(["node", str(POSTURE), "--articulate", "--n", str(N)], input=json.dumps(postures),
                          capture_output=True, text=True, cwd=REPO, check=True, encoding="utf-8")
    return {k: np.array(v) for k, v in json.loads(done.stdout).items()}


def compare() -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    P = pd.read_csv(OUT / "profiles.csv")
    srcs = posture_sources()
    u_eng = np.arange(N) / (N - 1)
    sel = (u_eng >= U_LO) & (u_eng <= U_HI)
    rows, panels = [], []
    for name, g in P.groupby("prompt", sort=False):
        ipa = g["ipa"].iloc[0]
        if ipa == "rest":
            continue
        g = g[(g.u >= U_LO) & (g.u <= U_HI)]
        w = np.interp(u_eng[sel], g["u"], g["width_mm"])
        j = int(np.argmin(w)); u_m = u_eng[sel][j]
        row = {"prompt": name, "ipa": ipa, "mri_min_mm": w[j], "mri_min_u": u_m, "mri_min_over_mean": w[j] / w.mean()}
        d_all = {}
        for sname, table in srcs.items():
            A = table.get(ipa)
            if A is None:
                continue
            d = articulate({ipa: A})[ipa][sel]
            d_all[sname] = d
            k = int(np.argmin(d)); u_e = u_eng[sel][k]
            r = float(np.corrcoef(w, d)[0, 1]) if w.std() > 0 and d.std() > 0 else np.nan
            row[f"{sname}_min_u"] = u_e
            row[f"{sname}_du_cm"] = (u_e - u_m) * 17.1
            row[f"{sname}_min_over_mean"] = d[k] / d.mean()
            row[f"{sname}_r"] = r
        rows.append(row)
        panels.append((name, ipa, u_eng[sel], w, d_all))
    R = pd.DataFrame(rows)
    R.to_csv(OUT / "compare.csv", index=False)

    pd.set_option("display.width", 220)
    cons = R[~R.ipa.isin(["i", "ɪ", "ɛ", "æ", "ɒ", "ʌ", "ʊ", "u", "ɝ", "ɑ", "ɔ", "ə"])]
    vow = R[R.ipa.isin(["i", "ɪ", "ɛ", "æ", "ɒ", "ʌ", "ʊ", "u", "ɝ", "ɑ", "ɔ", "ə"])]
    for label, T in [("CONSONANTS", cons), ("VOWELS", vow)]:
        print(f"\n=== {label}: where the tightest point is (u, 0 = glottis, 1 = lips), how far the model's is from the MRI's (cm), and profile r ===")
        cols = ["prompt", "ipa", "mri_min_u", "mri_min_mm"]
        for sname in srcs:
            cols += [f"{sname}_min_u", f"{sname}_du_cm", f"{sname}_r"]
        print(T[cols].round(2).to_string(index=False))
        print("  median |location error| cm: " + "  ".join(f"{s} {T[f'{s}_du_cm'].abs().median():.2f}" for s in srcs)
              + "     median r: " + "  ".join(f"{s} {T[f'{s}_r'].median():.2f}" for s in srcs))

    # the picture: one panel per phone, MRI width against the three diameter profiles
    n = len(panels); ncol = 5; nrow = int(np.ceil(n / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(3.4 * ncol, 2.6 * nrow), sharex=True)
    colours = {"engine": "#c0554e", "edinburgh": "#e8a33c", "speaker": "#3f7fd6"}
    for ax, (name, ipa, u, w, d_all) in zip(axes.flat, panels):
        ax2 = ax.twinx()
        ax.fill_between(u, 0, w, color="#93a1a8", alpha=0.35, label="MRI width (mm)")
        ax.plot(u, w, color="#3a4449", lw=1)
        for sname, d in d_all.items():
            ax2.plot(u, d, color=colours[sname], lw=1.2, label=sname)
        ax.set_title(f"{name}  /{ipa}/", fontsize=10); ax.set_ylim(0, max(25, w.max() * 1.05)); ax2.set_ylim(0, 2.9)
        ax.tick_params(labelsize=7); ax2.tick_params(labelsize=7)
    for ax in axes.flat[n:]:
        ax.axis("off")
    handles = [plt.Line2D([], [], color=c, lw=2, label=k) for k, c in colours.items() if k in srcs]
    handles.append(plt.Rectangle((0, 0), 1, 1, color="#93a1a8", alpha=0.35, label="MRI midsagittal width (mm, left axis)"))
    fig.legend(handles=handles, loc="lower right", fontsize=9, title="engine diameter (right axis)")
    fig.suptitle("The same speaker's MRI against the tube's postures, glottis (0) to lips (1)", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(OUT / "compare.png", dpi=80)
    print(f"\nwrote {OUT / 'compare.csv'} and {OUT / 'compare.png'}")
