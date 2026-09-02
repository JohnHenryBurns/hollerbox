"""The registration puts the coils where the anatomy is.

Needs the corpus and the mounted MRI; skips otherwise. Pins what was checked by eye and by number
when it was built: the palate envelope lies on the MRI roof to a couple of millimetres, the head
rotation between the two frames is small, the tip sized on the stops closes for /t/ and not for
/ɑ/, and the engine sections are warped onto the MRI by the two landmarks, not by equal fractions.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from fit import mngu0, mri, register_mri as RM, stage1r

pytestmark = [pytest.mark.slow,
              pytest.mark.skipif(not (mri.DICOM.exists() and mngu0.EMA_BASIC.exists() and (RM.OUT / "registration.json").exists()),
                                 reason="needs the corpus, the mounted MRI and a saved registration")]


@pytest.fixture(scope="module")
def reg():
    return RM.load_registration()


def test_envelope_sits_on_the_roof(reg):
    assert reg["palate_rms_mm"] < 3.0 and abs(reg["theta_deg"]) < 25, reg


def test_origin_is_at_the_incisors(reg):
    o = RM.to_px(np.zeros((1, 2)), reg["theta"], reg["tx"], reg["ty"])[0]
    assert 50 < o[0] < 75 and 70 < o[1] < 105, o          # the incisors' gum line in the image


def test_stops_close_and_open_vowels_do_not(reg):
    grid = mri.roof_grid()
    utts = [u for u in mngu0.filesets()["train"] if u in set(mngu0.utterances())][:40]
    u = grid["s_mm"] / grid["length_mm"]
    alv = (u > 0.86) & (u < 0.97)
    _, Wt = RM.midpoint_widths(utts, {"t", "d"}, reg, grid, reg["tip_len_mm"], reg["tip_deg"])
    _, Wa = RM.midpoint_widths(utts, {"A", "a"}, reg, grid, reg["tip_len_mm"], reg["tip_deg"])
    assert np.median(Wt[:, alv].min(axis=1)) < 2.0, "the tip does not reach the ridge for /t d/"
    assert np.median(Wa[:, alv].min(axis=1)) > 4.0, "open vowels close at the ridge"


def test_engine_sections_are_warped_by_anatomy():
    idx, us = stage1r.sections()
    assert 12 <= len(idx) <= 24
    # the engine's alveolar closure (0.80 of its tube) lands on the MRI's ridge (0.91)
    assert abs(stage1r.warp(np.array([0.80]))[0] - 0.91) < 1e-9
    assert abs(stage1r.warp(np.array([0.568]))[0] - 0.65) < 1e-9
