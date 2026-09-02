"""The same speaker's static MRI, read as an airway profile along the tract.

The check stage 0 and stage 1 both owe: a tract shape known independently of coils, formants and the
engine. mngu0's static set is one sagittal volume per sustained prompt — twelve vowels, the
fricatives, nasals, liquids and three held stops — 256 x 256 at 1.09 mm, 26 slices 4 mm apart. This
reads the midsagittal slice of each into a midsagittal airway WIDTH along the vocal tract, from the
glottis to the lips, so it can be laid beside the diameters `articulate` produces for the same phone.

METHOD, a fixed grid on the roof. The hard palate and the posterior pharyngeal wall do not move, so
they are traced once, on the rest image, as a polyline from the glottis to the upper lip (the velum
is included at its rest position; it moves a little and is not what this is about). The roof is
resampled every ~2 mm and at each point an inward normal is walked across the airway: past any wall
tissue the roof point sits in, through the dark run that is air, until the intensity comes back up
at the tongue, lower lip or larynx. The dark run's length is the width. A closure is a width of
zero. This is the semi-polar grid of the vocal-tract MRI literature with the geometry taken from the
anatomy that does not move rather than from a template.

WHAT IT IS NOT. A midsagittal width is not a cross-sectional area and not the engine's equivalent
diameter — the two are related through a shape factor that varies along the tract. So the numbers
to compare are the ones that survive that: WHERE along the tract the constriction is, HOW NARROW it
is relative to the rest of the tract, and the shape of the profile. Teeth are as dark as air on MRI,
so the last centimetre before the lips is read with that in mind. The glottis end is where the
larynx tissue closes the run and is approximate.

    python -m fit.mri profiles      -> out/mri/profiles.csv and one overlay PNG per prompt
    python -m fit.mri compare       -> the engine's postures against the profiles, per phone
    python -m fit.mri fit           -> postures fitted to the profiles, out/mri/mri_art.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import pydicom
from scipy.interpolate import splev, splprep
from scipy.ndimage import map_coordinates, median_filter

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "research" / "out" / "mri"
POSTURE = REPO / "lab" / "posture.js"
DICOM = Path(r"D:\DICOM")           # the mounted static ISO; see data/README.md
PX_MM = 1.0938

#: The roof is FOUND, not traced. A first trace by eye put the palate 11 mm too low — the bright arc
#: that reads as a palate on these images is the tongue's own mucosa, and the airway under the hard
#: palate sits above it with the nasal cavity's air above that. So: take the union of air over the
#: open vowels (the lowest intensity any of them shows at each pixel), and the roof of the oral cavity
#: is the top of the first air run below the palate bone, column by column; the posterior wall of the
#: pharynx is the back of the air run, row by row. The larynx end and the lips are where those runs
#: end. Saved to out/mri/roof.json so the grid is reproducible and inspectable.
ROOF_PROMPTS = ["HART", "HAT", "HOT", "HUT", "OUGHT", "PET"]
ORAL_COLS = (60, 130)        # the mouth, front to back, in image columns
ORAL_ROWS = (70, 135)        # below the nasal cavity, above the tongue root
PHARYNX_ROWS = (86, 176)     # from behind the velum down to the larynx
PHARYNX_COLS = (100, 152)
AIR = 170.0                          # below this is air (air sits at 60-110, tissue at 250-400)
STEP_MM = 2.0

#: series description -> IPA, as the ISO's README gives them
PROMPT_IPA = {"HIT": "ɪ", "PET": "ɛ", "HAT": "æ", "HOT": "ɒ", "HUT": "ʌ", "PUT": "ʊ", "HEAT": "i", "HOOT": "u",
              "HURT": "ɝ", "HART": "ɑ", "OUGHT": "ɔ", "ABOUT": "ə", "THERE": "ɛ", "FIN": "f", "THIN": "θ",
              "SIN": "s", "SHIN": "ʃ", "MOCK": "m", "KNOCK": "n", "THING": "ŋ", "RING": "r", "LONG": "l",
              "LOCH": "k", "SLEEP": "l", "P": "p", "T": "t", "K": "k", "BALL": "l", "speech synth sag": "rest"}


def series_index() -> dict[str, list[tuple[float, Path]]]:
    idx: dict[str, list[tuple[float, Path]]] = defaultdict(list)
    for f in sorted(DICOM.iterdir()):
        ds = pydicom.dcmread(str(f), stop_before_pixels=True)
        idx[str(ds.SeriesDescription)].append((float(ds.ImagePositionPatient[0]), f))
    return {k: sorted(v) for k, v in idx.items()}


def mid_slice(items: list[tuple[float, Path]]) -> np.ndarray:
    """The slice nearest the scanner's x = 0, lightly median-filtered against speckle."""
    k = int(np.argmin(np.abs([x for x, _ in items])))
    img = pydicom.dcmread(str(items[k][1])).pixel_array.astype(float)
    return median_filter(img, size=3)


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """(start, end) of each run of True, end exclusive."""
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        if not m and start is not None:
            out.append((start, i)); start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


#: centre of the semi-polar grid, inside the tongue body; rays sweep from the larynx, back through
#: the pharynx, up over the palate and forward to the lips
POLAR_CENTRE = (118.0, 100.0)
POLAR_START, POLAR_END = 0.55, 3.93          # angle of (drow, dcol) = (cos, sin): 0 is straight down
POLAR_RAYS = 160


def find_roof(idx: dict) -> list[tuple[float, float]]:
    """The fixed roof as (row, col) points from the larynx to the upper lip, read off the images.

    Semi-polar: from a centre inside the tongue, each ray's last air pixel (in the union of air over
    the open vowels, restricted to the airway's connected component) is where the roof begins.
    """
    from scipy.ndimage import label
    U = np.min([mid_slice(idx[p]) for p in ROOF_PROMPTS], axis=0)
    air = U < AIR
    air[:, :62] = False                 # in front of the lips is outside the head
    air[:60, :] = False; air[174:, :] = False
    lab, _ = label(air)
    seed = lab[81, 100]                 # under the hard palate in every open vowel
    comp = lab == seed
    pts = []
    t = np.arange(0, 90, 0.5)
    for phi in np.linspace(POLAR_START, POLAR_END, POLAR_RAYS):
        r = POLAR_CENTRE[0] + t * np.cos(phi); c = POLAR_CENTRE[1] + t * np.sin(phi)
        ok = (r >= 0) & (r < comp.shape[0] - 1) & (c >= 0) & (c < comp.shape[1] - 1)
        hit = np.where(ok & comp[np.clip(r.astype(int), 0, 255), np.clip(c.astype(int), 0, 255)])[0]
        if len(hit) == 0:
            continue
        k = hit[-1]
        pts.append((float(r[k] + np.cos(phi)), float(c[k] + np.sin(phi))))
    return pts


def roof_points(idx: dict | None = None) -> np.ndarray:
    cache = OUT / "roof.json"
    if cache.exists():
        return np.array(json.load(open(cache))["points"], float)
    pts = find_roof(idx or series_index())
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump({"points": pts, "from": ROOF_PROMPTS, "air_threshold": AIR}, open(cache, "w"), indent=0)
    return np.array(pts, float)


def roof_grid(idx: dict | None = None) -> dict:
    """The roof resampled every STEP_MM, with inward unit normals and arc length from the glottis."""
    pts = roof_points(idx)
    tck, _ = splprep([pts[:, 1], pts[:, 0]], s=len(pts) * 1.5, k=3)
    fine = np.linspace(0, 1, 2000)
    cx, cy = splev(fine, tck)
    arc = np.concatenate([[0], np.cumsum(np.hypot(np.diff(cx), np.diff(cy)))]) * PX_MM
    n = int(arc[-1] // STEP_MM) + 1
    s = np.interp(np.arange(n) * STEP_MM, arc, fine)
    cx, cy = splev(s, tck)
    dx, dy = splev(s, tck, der=1)
    nx, ny = dy, -dx                                  # rotate the tangent: down off the palate, forward off the wall
    nrm = np.hypot(nx, ny)
    return {"col": np.asarray(cx), "row": np.asarray(cy), "nx": nx / nrm, "ny": ny / nrm,
            "s_mm": np.arange(n) * STEP_MM, "length_mm": float(arc[-1])}


def widths(img: np.ndarray, grid: dict, reach_px: float = 45.0, sub: float = 0.5) -> pd.DataFrame:
    """Walk each normal inward: skip wall tissue, measure the dark run, stop at tissue again."""
    rows = []
    for i in range(len(grid["s_mm"])):
        reach = 22.0 if grid["s_mm"][i] > grid["length_mm"] - 12 else reach_px
        t = np.arange(0, reach, sub)
        r = grid["row"][i] + t * grid["ny"][i]
        c = grid["col"][i] + t * grid["nx"][i]
        v = map_coordinates(img, [r, c], order=1, mode="nearest")
        air = v < AIR
        # the roof point may sit inside the wall or on the palate bone: allow 12 px of tissue first
        start = None
        for k in range(len(t)):
            if air[k]:
                start = k
                break
            if t[k] > 12.0:
                break
        if start is None:                              # no air within reach of the roof: a closure
            w, end = 0.0, start
            tr, tc = grid["row"][i], grid["col"][i]
        else:
            end = start
            while end < len(t) and (air[end] or (end + 1 < len(t) and air[end + 1])):
                end += 1
            w = (t[min(end, len(t) - 1)] - t[start]) * PX_MM
            tr, tc = r[min(end, len(t) - 1)], c[min(end, len(t) - 1)]
        rows.append({"i": i, "s_mm": grid["s_mm"][i], "width_mm": w,
                     "roof_row": grid["row"][i], "roof_col": grid["col"][i], "tongue_row": tr, "tongue_col": tc})
    df = pd.DataFrame(rows)
    df["u"] = df["s_mm"] / grid["length_mm"]
    return df


def profiles(args) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    OUT.mkdir(parents=True, exist_ok=True)
    idx = series_index()
    (OUT / "roof.json").unlink(missing_ok=True)
    grid = roof_grid(idx)
    print(f"roof from glottis to upper lip: {grid['length_mm'] / 10:.1f} cm, {len(grid['s_mm'])} gridlines")
    all_rows = []
    for name, items in idx.items():
        if name not in PROMPT_IPA:
            continue
        img = mid_slice(items)
        df = widths(img, grid)
        df.insert(0, "ipa", PROMPT_IPA[name]); df.insert(0, "prompt", name)
        all_rows.append(df)
        j = int(df["width_mm"].iloc[3:-3].idxmin())
        print(f"  {name:16} {PROMPT_IPA[name]:4} min width {df.loc[j, 'width_mm']:4.1f} mm at u={df.loc[j, 'u']:.2f}"
              f"   mean {df['width_mm'].mean():.1f} mm")
        fig, ax = plt.subplots(figsize=(9, 9))
        ax.imshow(img[56:200, 32:176], cmap="gray", vmin=0, vmax=np.percentile(img, 99.5), extent=[31.5, 175.5, 199.5, 55.5])
        ax.plot(grid["col"], grid["row"], "y-", lw=0.8)
        for _, rw in df.iterrows():
            ax.plot([rw.roof_col, rw.tongue_col], [rw.roof_row, rw.tongue_row], "c-", lw=0.6, alpha=0.8)
        ax.plot(df["tongue_col"], df["tongue_row"], "r.", ms=3)
        ax.set_title(f"{name} /{PROMPT_IPA[name]}/: airway width along the roof's normals"); ax.axis("off")
        fig.savefig(OUT / f"profile_{name.replace(' ', '_')}.png", dpi=60, bbox_inches="tight"); plt.close(fig)
    P = pd.concat(all_rows, ignore_index=True)
    P.to_csv(OUT / "profiles.csv", index=False)
    json.dump({"roof": roof_points().tolist(), "air_threshold": AIR, "step_mm": STEP_MM, "length_mm": grid["length_mm"]},
              open(OUT / "grid.json", "w"), indent=1)
    print(f"wrote {OUT / 'profiles.csv'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("profiles")
    sub.add_parser("compare")
    sub.add_parser("fit")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "profiles":
        profiles(args)
    elif args.cmd == "compare":
        from .mri_compare import compare
        compare()
    elif args.cmd == "fit":
        from .mri_fit import fit
        fit()


if __name__ == "__main__":
    main()
