"""Run the engine's trajectory exporter and read what comes back.

The engine is never reimplemented here. This shells out to `lab/trajectories.js`, which drives the
same `buildWord` and the same worklet the browser loads, and reads its CSV. That is the whole of
the Node/Python boundary: Node makes trajectories, Python does statistics.

A second implementation of the model in Python would drift from the first, and would carry the
extra hazard that the thing being fitted is not the thing anyone has listened to. `lab/README.md`
records that fault being removed three times over.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
RUNNER = REPO / "lab" / "trajectories.js"

#: The six articulators, in the order `articulate` takes them.
ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]

#: What `--actual` adds: the same six read back out of the tract the engine actually spoke with.
ACT = ["act_" + a for a in ARTS]


@dataclass(frozen=True)
class Run:
    """One invocation of the exporter."""

    utterances: list[str]
    voice: str = "john"
    rate: int = 200
    actual: bool = True
    #: Parameter overrides, e.g. ``{"artT": 0.03}``. Validated by the runner against VOICE_SPEC,
    #: which is deliberate: a typo that silently did nothing would surface downstream as "this
    #: parameter has no effect", and that is the exact conclusion this project must not draw by
    #: accident.
    overrides: dict[str, float] = field(default_factory=dict)


def run(spec: Run, out: Path | None = None) -> pd.DataFrame:
    """Export trajectories for `spec` and return them as a DataFrame.

    Each utterance may be plain text, or ``id\\ttext`` to carry a corpus identifier through.
    """
    if not RUNNER.exists():                      # a clear error beats a confusing subprocess one
        raise FileNotFoundError(f"no trajectory runner at {RUNNER}")

    tmp = None
    if out is None:
        tmp = tempfile.TemporaryDirectory()
        out = Path(tmp.name) / "tracks.csv"

    try:
        src = out.with_suffix(".txt")
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("\n".join(spec.utterances) + "\n", encoding="utf-8")

        cmd = ["node", str(RUNNER), "--in", str(src), "--out", str(out),
               "--voice", spec.voice, "--rate", str(spec.rate)]
        if spec.actual:
            cmd.append("--actual")
        if spec.overrides:
            cmd += ["--set", ",".join(f"{k}={v!r}" if isinstance(v, str) else f"{k}={v}"
                                      for k, v in spec.overrides.items())]

        done = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
        if done.returncode != 0:
            raise RuntimeError(
                f"trajectories.js exited {done.returncode}\n"
                f"  cmd: {' '.join(cmd)}\n"
                f"  {done.stderr.strip()}"
            )
        return pd.read_csv(out)
    finally:
        if tmp is not None:
            tmp.cleanup()


def rms_difference(a: pd.DataFrame, b: pd.DataFrame, columns: list[str] | None = None,
                   max_inv_rms: float | None = 0.05) -> float:
    """Root-mean-square distance between two trajectory tables, over `columns`.

    Frames are matched on ``(utt, t)``, so two runs of different length do not silently compare
    frame 900 of one against frame 900 of the other.

    ``max_inv_rms`` drops frames where the posture inversion did not explain the tract shape. Those
    rows carry a posture that is a projection rather than a reading — `lab/artspace.js` says so at
    length — and including them measures the projection's failures rather than the model's motion.
    Pass ``None`` to keep everything.
    """
    columns = columns or ACT
    key = ["utt", "t"]
    merged = a.merge(b, on=key, suffixes=("_a", "_b"))
    if merged.empty:
        raise ValueError("no frames in common — different utterances, or different --rate")

    if max_inv_rms is not None and "inv_rms_a" in merged:
        keep = (merged["inv_rms_a"] <= max_inv_rms) & (merged["inv_rms_b"] <= max_inv_rms)
        if keep.sum() == 0:
            raise ValueError("every frame was dropped by max_inv_rms — nothing left to compare")
        merged = merged[keep]

    total, n = 0.0, 0
    for c in columns:
        d = (merged[f"{c}_a"] - merged[f"{c}_b"]).to_numpy(dtype=float)
        total += float((d ** 2).sum())
        n += d.size
    return (total / n) ** 0.5
