"""The corpus reader agrees with the corpus about itself.

These need the data, which is gitignored and licensed, so they skip cleanly where it is absent
rather than failing. Where it is present they pin two things the rest of stage 0 rests on: that the
EST_Track reader returns what the header promises, and that the coordinate convention documented in
`fit/mngu0.py` — x is the corpus's `py`, positive toward the back; y is `pz`, positive up — is the
one the corpus's own normalised package uses.
"""

from __future__ import annotations

import numpy as np
import pytest

from fit import mngu0

pytestmark = pytest.mark.skipif(not mngu0.EMA_BASIC.exists(), reason="mngu0 is not present under research/data")

UTT = "mngu0_s1_0001"


def test_est_reader_matches_header():
    t, D, names = mngu0.read_est(mngu0.EMA_BASIC / f"{UTT}.ema")
    assert D.shape == (len(t), 87)
    assert names[0] == "T3_px" and names[-1] == "taxdist"
    assert np.isclose(np.median(np.diff(t)), 0.005), "the basic trackfiles are 200 Hz"
    assert np.all(np.isfinite(D[:, :3])), "coil positions contain NaN"


def test_axes_agree_with_the_normalised_package():
    """norm_x is the basic `py` and norm_y the basic `pz`, frame for frame, up to the package's
    own processing: a three-frame moving average, then (x - mean) / (4 sd), then a silence trim.

    Found rather than assumed: aligning the two by least squares over the whole utterance gives a
    slope of 0.998 and an intercept of 0.00 on every channel, an rms of 0.0012 cm against the raw
    frames, and 0.0000 against a 3-point moving average of them. So the trackfiles read here are the
    numbers the published package was made from, and x really does increase toward the back.
    """
    S = mngu0.sensors(UTT)
    tn, Dn, names = mngu0.read_est(mngu0.EMA_NORM / f"{UTT}.ema")
    means = np.loadtxt(mngu0.EMA_NORM / "norm_parms" / "ema_means.txt")
    stds = np.loadtxt(mngu0.EMA_NORM / "norm_parms" / "ema_stds.txt")
    cols = [f"{s}_{a}" for _, s in mngu0.COILS for a in ("x", "y")]
    assert names[:12] == cols, names[:12]

    raw = S[cols].to_numpy()
    k3 = np.ones(3) / 3
    smooth = np.column_stack([np.convolve(raw[:, i], k3, mode="same") for i in range(12)])
    den = Dn[:, :12] * 4 * stds[:12] + means[:12]           # back into cm
    k = len(den)
    assert k < len(raw), "the normalised file should be the trimmed one"
    errs = [np.sqrt(((smooth[off:off + k] - den) ** 2).mean()) for off in range(len(raw) - k + 1)]
    off = int(np.argmin(errs))
    assert errs[off] < 1e-3, f"best alignment (offset {off}) still disagrees by {errs[off]:.4f} cm rms"
    # and the trim is where the labels say speech starts, give or take the context window
    segs = mngu0.read_lab(UTT)
    assert abs(off * 0.005 - segs[1][0]) < 0.1, f"trim at {off * 0.005:.3f} s, first phone at {segs[1][0]:.3f} s"


def test_labels_are_contiguous_and_inside_the_track():
    segs = mngu0.read_lab(UTT)
    S = mngu0.sensors(UTT)
    assert segs[0][0] == 0.0
    for (a0, b0, _), (a1, b1, _) in zip(segs, segs[1:]):
        assert b0 == a1 and b0 > a0
    assert segs[-1][1] <= S["t"].iloc[-1] + 0.01, "labels run past the end of the EMA track"
    assert segs[0][2] == "#" and segs[-1][2] == "#", "an utterance starts and ends in silence"


def test_token_table_has_one_row_per_label():
    segs = mngu0.read_lab(UTT)
    df = mngu0.tokens([UTT])
    assert len(df) == len(segs)
    assert list(df.phone) == [s[2] for s in segs]
    assert (df.dur > 0).all()
    assert np.isfinite(df[mngu0.XY].to_numpy()).all()
