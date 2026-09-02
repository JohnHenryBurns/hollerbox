"""Read the mngu0 day-1 EMA subset: trackfiles, alignments, and a per-phone token table.

Nothing here is modelled. This is the corpus side of stage 0: getting the measured coil positions
and the forced alignments into one table that Python can do statistics on. The engine side is
`lab/trajectories.js`, and the two meet in `register.py`.

WHAT THE FILES ARE, read out of the headers rather than assumed:

  ema_basic/*.ema   EST_Track, binary little-endian float32, 200 Hz, 87 channels. Eight coils, each
                    with position (px py pz), orientation (ox oy oz), an rms fit error and a
                    "newflag". Head movement is already corrected: the head coils sit still to
                    within 0.02 cm. Units are cm, origin at the upper-incisor reference coil.
  ema_norm/*.ema    the same six speech coils reduced to two coordinates each, silence-trimmed and
                    z-scored. Its README names them "x (back/front) and y (up/down)". Checked
                    against the basic files frame by frame (tests/test_mngu0.py): x is `py` and y
                    is `pz`, passed through a three-frame moving average, then (x - mean)/(4 sd),
                    then trimmed to the labelled speech. So in this corpus X INCREASES TOWARD THE
                    BACK of the mouth (the dorsum coil sits at +5.4, the lips at -1.0) and Y
                    increases upward. Kept as-is rather than flipped, because every published
                    mngu0 number uses this convention.
  lab/*.lab         ESPS label files: one phone per line, its END time in seconds, Combilex SAMPA.
                    `#` is silence. The .utt beside each one carries the prompt text and words.

The `px` axis is lateral and is ignored: this is a midsagittal comparison, the engine has one
dimension, and the tongue coils sit within a few mm of the midline anyway.

    python -m fit.mngu0 --tokens out/mngu0_tokens.csv     one row per phone token, whole corpus
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "research" / "data" / "mngu0"
EMA_BASIC = DATA / "mngu0_s1_ema_basic_1.1.0"
EMA_NORM = DATA / "mngu0_s1_ema_norm_1.0.1"
LAB = DATA / "mngu0_s1_lab_1.1.1"
FILESETS = DATA / "mngu0_s1_ema_filesets_1.0.0"

#: The six speech coils, in the order the norm package uses, with the short names it gives them.
COILS = [("T3", "T3"), ("T2", "T2"), ("T1", "T1"),
         ("jaw", "JAW"), ("upperlip", "UL"), ("lowerlip", "LL")]
#: The twelve midsagittal coordinates, as columns.
XY = [f"{s}_{a}" for _, s in COILS for a in ("x", "y")]

#: Combilex monophthongs, so the vowel set can be selected without a string match every time.
MONOPHTHONGS = ["i", "I", "E", "a", "V", "A", "O", "U", "u", "@@", "@", "Q"]
DIPHTHONGS = ["eI", "aI", "OI", "aU", "@U", "I@", "E@", "U@"]
VOWELS = MONOPHTHONGS + DIPHTHONGS + ["o^"]


def read_est(path: Path) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """An EST_Track file as (times, data, channel names). Binary and ascii both handled."""
    with open(path, "rb") as f:
        header: dict[str, str] = {}
        chans: dict[int, str] = {}
        while True:
            line = f.readline().decode("latin1").strip()
            if not line and f.tell() == 0:
                raise ValueError(f"{path}: empty")
            if line == "EST_Header_End":
                break
            m = re.match(r"Channel_(\d+)\s+(\S+)", line)
            if m:
                chans[int(m.group(1))] = m.group(2)
                continue
            parts = line.split(None, 1)
            if len(parts) == 2:
                header[parts[0]] = parts[1]
        nf, nc = int(header["NumFrames"]), int(header["NumChannels"])
        if header.get("DataType", "binary") == "binary":
            bo = ">" if header.get("ByteOrder") == "10" else "<"
            raw = np.fromfile(f, dtype=bo + "f4", count=nf * (nc + 2)).reshape(nf, nc + 2)
        else:
            raw = np.loadtxt(f).reshape(nf, nc + 2)
    names = [chans.get(i, f"ch{i}") for i in range(nc)]
    # column 0 is time, column 1 the break flag (always 1 here)
    return raw[:, 0].astype(float), raw[:, 2:].astype(float), names


def sensors(utt: str) -> pd.DataFrame:
    """The six speech coils of one utterance, midsagittal, in cm, plus each coil's rms fit error.

    Columns: t, T3_x, T3_y, T2_x, ..., LL_y, T3_rms, ..., LL_rms. x = the corpus's `py`
    (positive toward the back), y = its `pz` (positive up).
    """
    t, D, names = read_est(EMA_BASIC / f"{utt}.ema")
    col = {n: i for i, n in enumerate(names)}
    out = {"t": t}
    for long, short in COILS:
        out[f"{short}_x"] = D[:, col[f"{long}_py"]]
        out[f"{short}_y"] = D[:, col[f"{long}_pz"]]
    for long, short in COILS:
        out[f"{short}_rms"] = D[:, col[f"{long}_rms"]]
    return pd.DataFrame(out)


def read_lab(utt: str) -> list[tuple[float, float, str]]:
    """(start, end, phone) for every labelled interval, including silences (`#`)."""
    segs = []
    prev = 0.0
    with open(LAB / f"{utt}.lab", encoding="latin1") as f:
        body = False
        for line in f:
            line = line.rstrip("\n")
            if not body:
                if line.strip() == "#":
                    body = True
                continue
            parts = line.split()
            if len(parts) < 3:
                continue
            end = float(parts[0])
            segs.append((prev, end, parts[2]))
            prev = end
    return segs


def prompt_text(utt: str) -> str:
    """The prompt as spoken, from the Festival utterance structure."""
    with open(LAB / f"{utt}.utt", encoding="latin1") as f:
        for line in f:
            m = re.search(r'iform\s+"\\"(.*)\\""\s*;', line)
            if m:
                return m.group(1)
    return ""


def utterances() -> list[str]:
    return sorted(p.stem for p in EMA_BASIC.glob("mngu0_s1_*.ema"))


def filesets() -> dict[str, list[str]]:
    """The standard train / validation / test split that ships with the corpus."""
    return {k: (FILESETS / f"{k}files.txt").read_text().split()
            for k in ("train", "validation", "test")}


def tokens(utts: list[str] | None = None, verbose: bool = False) -> pd.DataFrame:
    """One row per phone token in the corpus, with the coil positions at its temporal midpoint.

    Also the mean over the middle half of the token (`m_*`), which is less sensitive to where the
    aligner put the boundary, and the worst rms fit error any of the six coils reported inside the
    token, so poorly tracked frames can be dropped rather than averaged in.
    """
    utts = utts or utterances()
    rows = []
    for k, utt in enumerate(utts):
        try:
            S = sensors(utt)
            segs = read_lab(utt)
        except FileNotFoundError as e:
            if verbose:
                print("skip", utt, e)
            continue
        t = S["t"].to_numpy()
        XYv = S[XY].to_numpy()
        RMS = S[[f"{s}_rms" for _, s in COILS]].to_numpy()
        for i, (a, b, ph) in enumerate(segs):
            mid = 0.5 * (a + b)
            j = int(np.clip(np.searchsorted(t, mid), 0, len(t) - 1))
            lo = int(np.searchsorted(t, a + 0.25 * (b - a)))
            hi = int(np.searchsorted(t, b - 0.25 * (b - a)))
            hi = max(hi, lo + 1)
            row = {"utt": utt, "i": i, "phone": ph,
                   "prev": segs[i - 1][2] if i > 0 else "",
                   "next": segs[i + 1][2] if i + 1 < len(segs) else "",
                   "start": a, "end": b, "dur": b - a,
                   "n_seg": len(segs), "utt_pos": mid / segs[-1][1]}
            for c, name in enumerate(XY):
                row[name] = XYv[j, c]
                row["m_" + name] = XYv[lo:hi, c].mean()
            row["rms_max"] = RMS[lo:hi].max()
            rows.append(row)
        if verbose and k % 100 == 0:
            print(f"{k}/{len(utts)} {utt}: {len(segs)} segments")
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokens", type=Path, help="write the per-token table here")
    ap.add_argument("--limit", type=int, help="only the first N utterances")
    args = ap.parse_args()
    utts = utterances()
    if args.limit:
        utts = utts[: args.limit]
    print(f"{len(utts)} utterances with EMA under {EMA_BASIC.name}")
    if args.tokens:
        df = tokens(utts, verbose=True)
        args.tokens.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(args.tokens, index=False)
        print(f"{len(df)} tokens, {df['phone'].nunique()} phone types -> {args.tokens}")
        print(df["phone"].value_counts().to_string())


if __name__ == "__main__":
    main()
