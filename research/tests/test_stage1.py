"""The corpus-clock path: imposed durations land where they were asked to.

Stage 1 drives the planner from the corpus's own segmentation (`--seg`, `buildWord`'s `durs`). If
the segments do not fall where the labels put them, every frame is compared against the wrong
instant of the measurement and the residual is an alignment error wearing a linguistic hat. These
run the real runner on a hand-written line and check the clock. No corpus needed.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

REPO = Path(__file__).resolve().parents[2]
RUNNER = REPO / "lab" / "trajectories.js"

# symbol/duration[/stress]; `_` is a pause. Durations chosen so the boundaries are easy to read.
LINE = "u1\tð/0.05 ə/0.05 k/0.06 w/0.05 ɪ/0.06/1 k/0.07 _/0.12 b/0.07 r/0.05 aʊ/0.14/1 n/0.06 f/0.08 ɒ/0.09/1 k/0.06 s/0.10"
DURS = [float(t.split("/")[1]) for t in LINE.split("\t")[1].split()]


def run_seg(extra: list[str]) -> pd.DataFrame:
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "in.txt"
        src.write_text(LINE + "\n", encoding="utf-8")
        out = Path(d) / "out.csv"
        done = subprocess.run(["node", str(RUNNER), "--in", str(src), "--out", str(out), "--voice", "mngu0",
                               "--rate", "200", "--seg", *extra], capture_output=True, text=True, cwd=REPO, encoding="utf-8")
        assert done.returncode == 0, done.stderr
        return pd.read_csv(out)


def test_segments_follow_the_imposed_durations():
    df = run_seg(["--diam"])
    # each labelled segment's midpoint, on the corpus clock, must be inside that segment in the model
    starts = np.concatenate([[0.0], np.cumsum(DURS)[:-1]])
    syms = [t.split("/")[0] for t in LINE.split("\t")[1].split()]
    for i, (a, dur, sym) in enumerate(zip(starts, DURS, syms)):
        if sym == "_":
            continue
        mid = a + dur / 2
        row = df.iloc[(df["t"] - mid).abs().argmin()]
        assert row["phone"] == sym, f"segment {i} ({sym}) at {mid:.3f}s: model has {row['phone']!r}"
    # and the whole thing is as long as the labels say, give or take the runner's tail
    total = sum(DURS)
    assert abs(df["t"].max() - (total + 0.22)) < 0.02


def test_diam_columns_are_the_tube():
    df = run_seg(["--diam"])
    dcols = [c for c in df.columns if c.startswith("d_")]
    assert len(dcols) == 49, "the Edinburgh voice has 49 sections"
    D = df[dcols].to_numpy(float)
    assert np.isfinite(D).all()
    # the floor is articulate's 0.02; the ceiling is the 2.20 resting mouth times the open-jaw
    # factor of 1.27, so 2.8 is the tract's own range and anything past it is not a tract
    assert D.min() >= 0.02 - 1e-6 and D.max() <= 2.8, "diameters outside the tract's range"
    # a stop closes: somewhere during the /k/ the tube seals
    k = df[df["phone"] == "k"]
    assert (k[dcols].min(axis=1) <= 0.0201).any(), "no closure during /k/"


def test_stress_is_carried_through():
    df = run_seg(["--diam"])
    assert set(df.loc[df["phone"] == "ɪ", "stress"]) == {1}
    assert set(df.loc[df["phone"] == "ə", "stress"]) == {0}


@pytest.mark.slow
def test_actual_and_diam_agree_on_the_shape():
    """Most frames of a running trajectory are shapes a posture can make, and the rest are the
    area-space transitions RESEARCH.md measured — shapes between two postures that no posture
    reaches. Measured on this line: 41% of frames within 0.02 rms, 69% within 0.05, 98% within 0.1,
    against a tract whose diameters run 0.02 to 2.8. Pinned so a regression in the inversion, or a
    planner change that makes transitions stranger, is noticed."""
    df = run_seg(["--diam", "--actual"])
    assert (df["inv_rms"] < 0.05).mean() > 0.55, "the inversion explains fewer frames than it used to"
    assert (df["inv_rms"] < 0.10).mean() > 0.90
