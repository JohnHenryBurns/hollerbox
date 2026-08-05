"""The fitting side: statistics over trajectories the engine produced.

Nothing in this package models speech. `lab/trajectories.js` makes trajectories by driving the
shipping engine; this reads them, fits, regresses and plots. The boundary is deliberate and is
argued in research/README.md.
"""

from .tracks import ARTS, ACT, Run, run, rms_difference

__all__ = ["ARTS", "ACT", "Run", "run", "rms_difference"]
