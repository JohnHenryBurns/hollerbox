"""The MRI reading recovers the anatomy a phonetician would draw.

Needs the static ISO mounted (data/README.md); skips otherwise. Slow, because it reads 31 volumes.
Pins the things that went wrong once: the roof's length (a trace that sat on the tongue's mucosa
read 16 cm and then a zigzag read 35), and the places of the two held stops.
"""

from __future__ import annotations

import numpy as np
import pytest

from fit import mri

pytestmark = [pytest.mark.slow,
              pytest.mark.skipif(not mri.DICOM.exists(), reason="the static MRI ISO is not mounted")]


@pytest.fixture(scope="module")
def idx():
    return mri.series_index()


@pytest.fixture(scope="module")
def grid(idx):
    return mri.roof_grid(idx)


def test_roof_is_a_vocal_tract_long(grid):
    assert 15.5 < grid["length_mm"] / 10 < 19.0, f"roof {grid['length_mm'] / 10:.1f} cm"


def tightest(idx, grid, name):
    df = mri.widths(mri.mid_slice(idx[name]), grid)
    df = df[(df.u > 0.12) & (df.u < 0.98)]
    j = df["width_mm"].idxmin()
    return df.loc[j, "u"], df.loc[j, "width_mm"]


def test_k_closes_at_the_velum(idx, grid):
    u, w = tightest(idx, grid, "K")
    assert w < 0.6 and 0.58 < u < 0.72, (u, w)


def test_t_closes_at_the_alveolar_ridge(idx, grid):
    u, w = tightest(idx, grid, "T")
    assert w < 0.6 and 0.86 < u < 0.96, (u, w)


def test_open_vowel_is_open_in_front(idx, grid):
    df = mri.widths(mri.mid_slice(idx["HART"]), grid)
    front = df[(df.u > 0.75) & (df.u < 0.92)]["width_mm"].mean()
    back = df[(df.u > 0.3) & (df.u < 0.55)]["width_mm"].mean()
    assert front > 2 * back, f"/ɑ/ front {front:.1f} mm, velar {back:.1f} mm"
