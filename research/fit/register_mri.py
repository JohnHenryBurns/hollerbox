"""The coils registered into the MRI's frame, so the palate is a wall and a closure is a closure.

`mrimap.py` showed that no smooth reading of six coil coordinates can place a consonant: at its
midpoint a /t/ is KIT to the coils, because the tip coil is a centimetre behind the tip and a
contact is a millimetre inside 2.5 mm of scatter. What the coils do carry is WHERE THEY ARE, in
centimetres, and the MRI carries where the roof is, in centimetres. Put the two in one frame and the
airway at each point along the roof is the distance from the roof to the tongue — a geometric
quantity, no map, and a closure is where that distance reaches zero.

THREE STEPS.

  1. The palate, in coil coordinates. Over the corpus the tongue coils reach the palate thousands of
     times — every /t d n l s/ for the tip coil, every /k g ŋ/ for the body coil. Their upper
     envelope (the 99.5th percentile of height in each 2 mm bin of front–back position) is the
     hard palate's underside in the coils' own frame, the way EMA palate traces are usually made
     when nobody dragged a coil along it.
  2. Registration. Both frames are metric and both are midsagittal, so the transform is rigid:
     a rotation and a translation, three numbers, solved so the envelope lies on the MRI roof over
     the hard palate. The upper-incisor reference coil is the coils' origin and the incisors are
     visible in the image, which pins the front. The MRI was supine and the EMA upright; the palate
     is bone, so the registration does not care, and the tongue sags a little, which is reported
     rather than corrected.
  3. Profiles. Per frame, a tongue contour through the dorsum, body and tip coils, extended forward
     to the tip by a length calibrated so that /t/ midpoints touch the alveolar ridge and no further,
     and backward down the root; the lips from the lip coils. The width at each roof gridline is the
     distance along its normal to that contour, clipped at zero. Resampled to the engine's sections,
     it is directly comparable to `articulate`'s diameters as a shape, exactly as the MRI was.

    python -m fit.register_mri envelope     the palate in coil coordinates, and the registration
    python -m fit.register_mri check        per-phone mean coil profiles against the MRI profiles
    python -m fit.register_mri profiles     every frame of every utterance, cached for stage 1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from . import mri
from .mngu0 import filesets, read_lab, sensors, utterances

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "research" / "out" / "reg"
PX_MM = mri.PX_MM
TONGUE = ["T3", "T2", "T1"]           # back to front


# ───────────────────────── 1. the palate in coil coordinates ─────────────────────────

def coil_cloud(utts: list[str]) -> pd.DataFrame:
    """Every tongue-coil frame of the given utterances, as (x, y) in cm, with which coil and phone."""
    rows = []
    for u in utts:
        S = sensors(u).interpolate(limit_direction="both")
        labs = read_lab(u)
        ends = np.array([b for _, b, _ in labs])
        seg = np.clip(np.searchsorted(ends, S["t"].to_numpy(), side="left"), 0, len(labs) - 1)
        ph = np.array([labs[i][2] for i in seg])
        for c in TONGUE:
            rows.append(pd.DataFrame({"coil": c, "x": S[f"{c}_x"], "y": S[f"{c}_y"], "phone": ph}))
    return pd.concat(rows, ignore_index=True)


def envelope(cloud: pd.DataFrame, step: float = 0.2, q: float = 99.5, min_n: int = 200) -> pd.DataFrame:
    """The upper envelope of the tongue coils: the palate's underside, in coil coordinates."""
    xs = np.arange(np.floor(cloud.x.min() * 5) / 5, cloud.x.max(), step)
    rows = []
    for a in xs:
        sel = cloud[(cloud.x >= a) & (cloud.x < a + step)]
        if len(sel) >= min_n:
            rows.append({"x": a + step / 2, "y": float(np.percentile(sel.y, q)), "n": len(sel)})
    return pd.DataFrame(rows)


# ───────────────────────── 2. registration ─────────────────────────

def to_px(xy_cm: np.ndarray, theta: float, tx: float, ty: float) -> np.ndarray:
    """Coil (x back, y up) in cm -> image (col, row) in px. y flips because rows run down."""
    p = np.column_stack([xy_cm[:, 0], -xy_cm[:, 1]]) * 10.0 / PX_MM
    c, s = np.cos(theta), np.sin(theta)
    R = np.array([[c, -s], [s, c]])
    return p @ R.T + np.array([tx, ty])


def register(env: pd.DataFrame, roof: np.ndarray, incisor_px: tuple[float, float] | None,
             x_range: tuple[float, float] = (1.2, 4.2)) -> dict:
    """Rigid transform putting the envelope on the roof over the hard palate."""
    E = env[(env.x >= x_range[0]) & (env.x <= x_range[1])][["x", "y"]].to_numpy()
    roof_pts = roof                                   # (row, col) px along the roof, dense

    def resid(p):
        theta, tx, ty = p
        P = to_px(E, theta, tx, ty)                   # (col, row)
        d = np.sqrt(((P[:, None, 0] - roof_pts[None, :, 1]) ** 2) + ((P[:, None, 1] - roof_pts[None, :, 0]) ** 2)).min(axis=1)
        r = list(d)
        if incisor_px is not None:
            o = to_px(np.zeros((1, 2)), theta, tx, ty)[0]
            r += [0.5 * (o[0] - incisor_px[0]), 0.5 * (o[1] - incisor_px[1])]
        return np.array(r)

    # start: no rotation, origin at the incisors (or a guess just behind the lips)
    x0 = [0.0, *(incisor_px or (66.0, 96.0))]
    best = None
    for th in np.linspace(-0.4, 0.4, 9):
        r = least_squares(resid, [th, x0[1], x0[2]], loss="soft_l1", f_scale=2.0)
        if best is None or r.cost < best.cost:
            best = r
    theta, tx, ty = best.x
    P = to_px(E, theta, tx, ty)
    d = np.sqrt(((P[:, None, 0] - roof_pts[None, :, 1]) ** 2) + ((P[:, None, 1] - roof_pts[None, :, 0]) ** 2)).min(axis=1)
    return {"theta": float(theta), "tx": float(tx), "ty": float(ty), "theta_deg": float(np.degrees(theta)),
            "palate_rms_mm": float(np.sqrt((d ** 2).mean()) * PX_MM), "palate_max_mm": float(d.max() * PX_MM),
            "n_points": int(len(E)), "x_range_cm": list(x_range)}


def roof_dense() -> np.ndarray:
    """The MRI roof as dense (row, col) points along its spline."""
    g = mri.roof_grid()
    return np.column_stack([g["row"], g["col"]])


def cmd_envelope(args) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    OUT.mkdir(parents=True, exist_ok=True)
    utts = [u for u in filesets()["train"] if u in set(utterances())][: args.utts]
    t0 = time.time()
    cloud = coil_cloud(utts)
    env = envelope(cloud)
    env.to_csv(OUT / "palate_envelope.csv", index=False)
    print(f"{len(cloud)} tongue-coil frames from {len(utts)} utterances ({time.time() - t0:.0f} s); envelope over x {env.x.min():.1f}–{env.x.max():.1f} cm")

    roof = roof_dense()
    reg = register(env, roof, tuple(args.incisor) if args.incisor else None, x_range=(args.xmin, args.xmax))
    print(f"registration: rotation {reg['theta_deg']:+.1f}°, translation ({reg['tx']:.1f}, {reg['ty']:.1f}) px; "
          f"envelope on the roof to {reg['palate_rms_mm']:.2f} mm rms, {reg['palate_max_mm']:.2f} mm max over {reg['n_points']} points")
    json.dump(reg, open(OUT / "registration.json", "w"), indent=1)

    # the picture: the coil cloud and the envelope on the rest MRI, with the roof
    img = np.load(REPO / "research" / "out" / "mri" / "mid_rest.npy") if (REPO / "research" / "out" / "mri" / "mid_rest.npy").exists() \
        else mri.mid_slice(mri.series_index()["speech synth sag"])
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.imshow(img[40:200, 32:176], cmap="gray", vmin=0, vmax=np.percentile(img, 99.5), extent=[31.5, 175.5, 199.5, 39.5])
    samp = cloud.sample(min(40000, len(cloud)), random_state=1)
    P = to_px(samp[["x", "y"]].to_numpy(), reg["theta"], reg["tx"], reg["ty"])
    colours = {"T3": "#c0554e", "T2": "#e8a33c", "T1": "#3f7fd6"}
    for c in TONGUE:
        m = (samp.coil == c).to_numpy()
        ax.plot(P[m, 0], P[m, 1], ".", ms=1, alpha=0.15, color=colours[c], label=c)
    E = to_px(env[["x", "y"]].to_numpy(), reg["theta"], reg["tx"], reg["ty"])
    ax.plot(E[:, 0], E[:, 1], "w-", lw=1.5, label="coil envelope (palate)")
    ax.plot(roof[:, 1], roof[:, 0], "y-", lw=1, label="MRI roof")
    o = to_px(np.zeros((1, 2)), reg["theta"], reg["tx"], reg["ty"])[0]
    ax.plot(o[0], o[1], "c+", ms=14, mew=2, label="coil origin (upper incisors)")
    ax.legend(loc="lower left", fontsize=8); ax.set_title("the coils in the MRI's frame"); ax.axis("off")
    fig.savefig(OUT / "registration.png", dpi=70, bbox_inches="tight")
    print(f"wrote {OUT / 'registration.png'}")


# ───────────────────────── 3. the tongue contour and the widths ─────────────────────────

def load_registration() -> dict:
    return json.load(open(OUT / "registration.json"))


def frame_points(S: pd.DataFrame, reg: dict) -> dict[str, np.ndarray]:
    """Every coil of every frame of an utterance, in image px (col, row)."""
    return {c: to_px(S[[f"{c}_x", f"{c}_y"]].to_numpy(), reg["theta"], reg["tx"], reg["ty"])
            for c in ["T3", "T2", "T1", "UL", "LL", "JAW"]}


def contour(pts: dict[str, np.ndarray], tip_len_mm: float, tip_deg: float) -> np.ndarray:
    """The tongue as a polyline per frame, (F, 5, 2): root, T3, T2, T1, tip.

    The tip is T1 carried on by `tip_len_mm` along the T2->T1 direction turned upward by `tip_deg`
    — the blade and tip the coil cannot see, sized on the stops. The root is T3 carried on down the
    T2->T3 direction by 20 mm, which is a guess about the pharynx and is flagged as one.
    """
    T3, T2, T1 = pts["T3"], pts["T2"], pts["T1"]
    d = T1 - T2
    d = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9)
    a = np.radians(tip_deg)                              # "up" is -row, so an upward turn is a negative rotation
    rot = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
    tip = T1 + (d @ rot.T) * (tip_len_mm / PX_MM)
    back = T3 - T2
    back = back / (np.linalg.norm(back, axis=1, keepdims=True) + 1e-9)
    root = T3 + back * (20.0 / PX_MM)
    return np.stack([root, T3, T2, T1, tip], axis=1)


def ray_widths(poly: np.ndarray, grid: dict, reach_px: float = 45.0) -> np.ndarray:
    """Distance from each roof gridline point along its inward normal to the contour, (F, G) in mm.

    A ray that meets no segment within `reach_px` is open at the reach. A contour above the roof
    is a contact and reads 0.
    """
    o = np.column_stack([grid["col"], grid["row"]])          # (G, 2)
    n = np.column_stack([grid["nx"], grid["ny"]])            # (G, 2)
    A = poly[:, :-1, :]; B = poly[:, 1:, :]                  # (F, K, 2)
    E = B - A
    ox, oy = o[None, :, None, 0], o[None, :, None, 1]
    nx, ny = n[None, :, None, 0], n[None, :, None, 1]
    ax, ay = A[:, None, :, 0], A[:, None, :, 1]
    ex, ey = E[:, None, :, 0], E[:, None, :, 1]
    det = nx * (-ey) - ny * (-ex)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = ((ax - ox) * (-ey) - (ay - oy) * (-ex)) / det
        s = (nx * (ay - oy) - ny * (ax - ox)) / det
    hit = (np.abs(det) > 1e-9) & (s >= 0) & (s <= 1) & (t >= -8.0 / PX_MM)
    t = np.where(hit, t, np.inf).min(axis=2)                   # (F, G)
    t = np.where(np.isfinite(t), t, reach_px)
    return np.clip(t, 0, reach_px) * PX_MM


def token_mid_frames(utts: list[str], phones: set[str]) -> pd.DataFrame:
    """Midpoint frames of every token of the given phones: utt, frame index, phone."""
    rows = []
    for u in utts:
        labs = read_lab(u)
        t0 = sensors(u)["t"].iloc[0]
        for a, b, ph in labs:
            if ph in phones:
                rows.append({"utt": u, "k": int(max(0, np.rint((0.5 * (a + b) - t0) / 0.005))), "phone": ph})
    return pd.DataFrame(rows)


#: where the coils speak: from the dorsum coil's gridline to the last tongue gridline before the lips.
#: Behind it the pharynx is an extrapolation of the root; in front of it the lips are the lip coils.
TRUSTED = (0.66, 0.93)
LIPS = 0.93


def lip_widths(S: pd.DataFrame, grid: dict, thickness_mm: float) -> np.ndarray:
    """The lip gridlines: the coil separation less the flesh between the coils and the aperture."""
    u = grid["s_mm"] / grid["length_mm"]
    gap = np.clip((S["UL_y"] - S["LL_y"]).to_numpy() * 10.0 - thickness_mm, 0, None)
    return np.where(u[None, :] >= LIPS, gap[:, None], np.nan)


def frame_widths(S: pd.DataFrame, reg: dict, grid: dict) -> np.ndarray:
    """All of one utterance's frames: tongue by rays, lips by the lip coils, (F, G) in mm."""
    pts = frame_points(S, reg)
    W = ray_widths(contour(pts, reg["tip_len_mm"], reg["tip_deg"]), grid)
    L = lip_widths(S, grid, reg.get("lip_thickness_mm", 0.0))
    return np.where(np.isnan(L), W, L)


def midpoint_widths(utts: list[str], phones: set[str], reg: dict, grid: dict, tip_len: float, tip_deg: float,
                    lips: bool = False) -> tuple[pd.DataFrame, np.ndarray]:
    """Widths at the midpoint frame of every token of `phones`: the table and the (n, G) widths."""
    M = token_mid_frames(utts, phones)
    W = np.zeros((len(M), len(grid["s_mm"])), np.float32)
    for u, g in M.groupby("utt", sort=False):
        S = sensors(u).interpolate(limit_direction="both")
        sel = np.clip(g["k"].to_numpy(), 0, len(S) - 1)
        pts = frame_points(S, reg)
        w = ray_widths(contour({c: v[sel] for c, v in pts.items()}, tip_len, tip_deg), grid)
        if lips:
            L = lip_widths(S.iloc[sel], grid, reg.get("lip_thickness_mm", 0.0))
            w = np.where(np.isnan(L), w, L)
        W[g.index] = w
    return M, W


def calibrate_lips(utts: list[str], reg: dict, grid: dict) -> float:
    """The flesh between the lip coils and the aperture: the coil separation at which /p b m/ close."""
    M = token_mid_frames(utts, {"p", "b", "m"})
    gaps = []
    for u, g in M.groupby("utt", sort=False):
        S = sensors(u).interpolate(limit_direction="both")
        sel = np.clip(g["k"].to_numpy(), 0, len(S) - 1)
        gaps.append((S["UL_y"].to_numpy()[sel] - S["LL_y"].to_numpy()[sel]) * 10.0)
    gaps = np.concatenate(gaps)
    return float(np.percentile(gaps, 75))          # three quarters of bilabial midpoints read closed


def calibrate_tip(utts: list[str], reg: dict, grid: dict) -> dict:
    """Size the tip so that /t d n/ midpoints close at the ridge and vowels do not.

    A grid over length and angle; the score is the squared median width at the alveolar gridlines
    for the stops plus the squared share of vowel midpoints that also close there, which is what a
    tip that is too long or too high does.
    """
    u = grid["s_mm"] / grid["length_mm"]
    alv = (u > 0.86) & (u < 0.97)
    stops = {"t", "d", "n"}; vow = {"i", "I", "E", "a", "A", "@", "u", "O"}
    best = None
    for L in [4, 6, 8, 10, 12, 14, 16]:
        for deg in [-20, -10, 0, 10, 20, 30, 40, 50]:
            _, Ws = midpoint_widths(utts, stops, reg, grid, L, deg)
            _, Wv = midpoint_widths(utts, vow, reg, grid, L, deg)
            close_s = float(np.median(Ws[:, alv].min(axis=1)))
            close_v = float((Wv[:, alv].min(axis=1) < 0.5).mean())
            score = close_s ** 2 + (10 * close_v) ** 2
            if best is None or score < best["score"]:
                best = {"tip_len_mm": L, "tip_deg": deg, "score": score, "stop_median_min_mm": close_s, "vowel_close_share": close_v}
    return best


def cmd_check(args) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from .mri_fit import PREFERRED
    from .mrimap import GROUPS

    reg = load_registration()
    grid = mri.roof_grid()
    utts = [u for u in filesets()["train"] if u in set(utterances())][: args.utts]
    if args.tip is None:
        t0 = time.time()
        cal = calibrate_tip(utts[:60], reg, grid)
        print(f"tip calibrated on {min(60, len(utts))} utterances: {cal['tip_len_mm']} mm at {cal['tip_deg']} deg; stops close to "
              f"{cal['stop_median_min_mm']:.2f} mm, {cal['vowel_close_share'] * 100:.1f}% of vowel midpoints close ({time.time() - t0:.0f} s)")
        reg.update({"tip_len_mm": cal["tip_len_mm"], "tip_deg": cal["tip_deg"], "tip_calibration": cal})
        reg["lip_thickness_mm"] = calibrate_lips(utts[:60], reg, grid)
        print(f"lips: coil separation less {reg['lip_thickness_mm']:.1f} mm of flesh, so that /p b m/ midpoints read closed")
        json.dump(reg, open(OUT / "registration.json", "w"), indent=1)
    else:
        reg["tip_len_mm"], reg["tip_deg"] = args.tip
    P = pd.read_csv(REPO / "research" / "out" / "mri" / "profiles.csv")
    inv = {lab: sym for sym, labs in GROUPS.items() for lab in labs}
    M, W = midpoint_widths(utts, set(inv), reg, grid, reg["tip_len_mm"], reg["tip_deg"], lips=True)
    u = grid["s_mm"] / grid["length_mm"]
    sel = (u >= 0.12) & (u <= 0.98)
    trusted = (u >= TRUSTED[0]) & (u <= 0.98)
    rows, panels = [], []
    for name, g in P.groupby("prompt", sort=False):
        ipa = g["ipa"].iloc[0]
        if ipa not in GROUPS or (ipa in PREFERRED and PREFERRED[ipa] != name):
            continue
        toks = (M["phone"].map(inv) == ipa).to_numpy()
        if toks.sum() < 20:
            continue
        w_coil = np.median(W[toks], axis=0)
        w_mri = np.interp(u, g["u"], g["width_mm"])
        a, b = w_coil[sel], w_mri[sel]
        at, bt = w_coil[trusted], w_mri[trusted]
        r = float(np.corrcoef(a, b)[0, 1]); rt = float(np.corrcoef(at, bt)[0, 1])
        du = (u[sel][np.argmin(a)] - u[sel][np.argmin(b)]) * grid["length_mm"] / 10
        dut = (u[trusted][np.argmin(at)] - u[trusted][np.argmin(bt)]) * grid["length_mm"] / 10
        rows.append({"phone": ipa, "tokens": int(toks.sum()), "r_all": r, "r_trusted": rt, "coil_min_mm": float(at.min()),
                     "mri_min_mm": float(bt.min()), "coil_min_u": float(u[trusted][np.argmin(at)]), "mri_min_u": float(u[trusted][np.argmin(bt)]),
                     "place_err_cm": du, "place_err_trusted_cm": dut})
        panels.append((ipa, u[sel], a, b))
    T = pd.DataFrame(rows)
    pd.set_option("display.width", 220)
    print(f"\n=== per phone: the median coil-derived width profile at token midpoints against the MRI profile "
          f"(trusted = u {TRUSTED[0]}..0.98, dorsum coil to lips) ===")
    print(T.round(2).to_string(index=False))
    vow = T.phone.isin(["i", "ɪ", "ɛ", "æ", "ʌ", "ɑ", "ɔ", "ʊ", "u", "ɝ", "ə", "ɒ"])
    for label, col, pc in [("whole tract", "r_all", "place_err_cm"), ("trusted region", "r_trusted", "place_err_trusted_cm")]:
        print(f"  {label:14} median r: vowels {T[vow][col].median():.2f}, consonants {T[~vow][col].median():.2f};  median |place error|: "
              f"vowels {T[vow][pc].abs().median():.2f} cm, consonants {T[~vow][pc].abs().median():.2f} cm")
    T.to_csv(OUT / "check.csv", index=False)
    n = len(panels); ncol = 6; nrow = int(np.ceil(n / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(3.2 * ncol, 2.4 * nrow), sharex=True, sharey=True)
    for ax, (ipa, uu, a, b) in zip(axes.flat, panels):
        ax.fill_between(uu, 0, b, color="#93a1a8", alpha=0.35); ax.plot(uu, b, color="#3a4449", lw=1, label="MRI, sustained")
        ax.plot(uu, a, color="#3f7fd6", lw=1.3, label="coils, token midpoints (median)")
        ax.set_title(f"/{ipa}/", fontsize=10); ax.set_ylim(0, 30); ax.tick_params(labelsize=7)
    for ax in axes.flat[n:]:
        ax.axis("off")
    axes.flat[0].legend(fontsize=7)
    fig.suptitle("Airway width from the registered coils against the MRI, glottis (0) to lips (1); mm", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.96)); fig.savefig(OUT / "check.png", dpi=80)
    print(f"  wrote {OUT / 'check.csv'} and {OUT / 'check.png'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("envelope")
    p.add_argument("--utts", type=int, default=300)
    p.add_argument("--incisor", type=float, nargs=2, metavar=("COL", "ROW"), help="upper incisor tip in image px, to pin the front")
    p.add_argument("--xmin", type=float, default=1.2); p.add_argument("--xmax", type=float, default=4.2)
    p = sub.add_parser("check")
    p.add_argument("--utts", type=int, default=300)
    p.add_argument("--tip", type=float, nargs=2, metavar=("MM", "DEG"), help="skip calibration; use this tip")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    if args.cmd == "envelope":
        cmd_envelope(args)
    elif args.cmd == "check":
        cmd_check(args)


if __name__ == "__main__":
    main()
