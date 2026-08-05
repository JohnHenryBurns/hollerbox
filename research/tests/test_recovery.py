"""The pipeline must find a parameter it was given.

These run the real engine through the real runner. They are slow by the standards of a unit test —
tens of seconds — and that is the point: a fast test here would be testing a mock.
"""

from __future__ import annotations

import numpy as np
import pytest

from fit.recover import PROBE, is_identifiable, recover
from fit.tracks import ACT, Run, rms_difference, run


def test_runner_produces_both_tracks():
    df = run(Run(utterances=PROBE[:1]))
    assert len(df) > 100
    for c in ["jaw", "act_jaw", "inv_rms", "clamped", "phone", "stress", "utt_pos"]:
        assert c in df.columns, c


def test_planned_track_ignores_the_gesture_knobs():
    """The finding that started all of this, asserted so it cannot quietly stop being true.

    `artT` moves the tract the engine speaks with and leaves the planned articulator columns
    exactly where they were. If this ever fails, `--actual` has stopped being necessary and a
    great deal of RESEARCH.md needs rewriting.
    """
    a = run(Run(utterances=PROBE[:1], overrides={"artT": 0.0}))
    b = run(Run(utterances=PROBE[:1], overrides={"artT": 0.05}))

    planned = rms_difference(a, b, columns=["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"],
                             max_inv_rms=None)
    actual = rms_difference(a, b, columns=ACT, max_inv_rms=None)

    assert planned == pytest.approx(0.0, abs=1e-12), "artT moved the planned track — good news"
    assert actual > 0.01, "artT did not move the spoken track either — something is very wrong"


def test_identical_settings_give_identical_tracks():
    """Determinism. Without it, every difference measured below is partly noise."""
    a = run(Run(utterances=PROBE[:1], overrides={"artT": 0.025}))
    b = run(Run(utterances=PROBE[:1], overrides={"artT": 0.025}))
    assert rms_difference(a, b, max_inv_rms=None) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.slow
def test_recovers_planted_artT():
    grid = [0.0, 0.01, 0.02, 0.025, 0.03, 0.04, 0.05]
    r = recover("artT", planted=0.03, grid=grid, utterances=PROBE[:2])
    ok, why = is_identifiable(r, tol=0.005)
    assert ok, why
