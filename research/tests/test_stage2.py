"""Stage 2's bookkeeping holds together without the corpus."""

from __future__ import annotations

from fit.stage1 import COMBILEX
from fit.stage2 import CLASS, LEVELS


def test_every_corpus_phone_has_a_neighbour_class():
    assert set(COMBILEX) <= set(CLASS)
    assert CLASS["#"] == "pause" and CLASS["t"] == "alveolar" and CLASS["k"] == "velar" and CLASS["i"] == "V_front"


def test_levels_are_nested():
    """Each level's formula contains the previous one's terms, so the increments mean what they say."""
    prev = set()
    for _, rhs in LEVELS:
        terms = {t.strip() for t in rhs.split("+")}
        assert prev <= terms, rhs
        prev = terms
