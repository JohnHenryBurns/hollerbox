"""Which control parameters can be read back out of a trajectory at all?

Run before a corpus exists, because it does not need one and because its answer decides what stage 1
can honestly claim to fit. Each parameter is planted at a known value, the model generates the
trajectory it produces, and the parameter is then searched for on a grid. Three outcomes:

  identified   the objective has a clear minimum at the planted value
  flat         the objective barely moves — the parameter does not shape a trajectory, so no amount
               of corpus will fit it and reporting a fitted value would be reporting noise
  confounded   the objective moves but the minimum is somewhere else, which usually means another
               parameter can absorb it

This is stage 1's isolation pass, and `lab/fit-auto.js` refuses to run without its equivalent for a
reason recorded there: its first version "succeeded" by driving the knobs it was tuning to their off
values.

    python -m fit.identify                 the six gesture parameters
    python -m fit.identify --param artT    just one, with its whole error curve
"""

from __future__ import annotations

import argparse

from .recover import PROBE, recover
from .tracks import Run

#: (parameter, planted, grid). Grids span each parameter's VOICE_SPEC range and include the planted
#: value, because a grid that cannot represent the answer tests the grid rather than the parameter.
GESTURE = [
    ("artT",     0.030, [0.0, 0.015, 0.030, 0.045, 0.060]),
    ("artCrit",  2.000, [0.0, 1.0, 2.0, 3.0, 4.0]),
    ("artStiff", 0.500, [0.10, 0.30, 0.50, 0.75, 1.00]),
    ("artPush",  0.450, [0.0, 0.225, 0.45, 0.70, 1.00]),
    ("artFar",   1.400, [0.0, 0.7, 1.4, 2.1, 3.0]),
    ("velT",     0.030, [0.0, 0.015, 0.030, 0.045, 0.060]),
]


def verdict(r, tol: float) -> str:
    span = max(r.error) - min(r.error)
    if span < 1e-6:
        return "FLAT"
    if abs(r.found - r.planted) <= tol:
        return "identified"
    return "confounded"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--param", help="just this one")
    ap.add_argument("--utterances", type=int, default=2, help="how many probe utterances")
    ap.add_argument("--voice", default="john")
    args = ap.parse_args()

    todo = [p for p in GESTURE if args.param in (None, p[0])]
    if not todo:
        raise SystemExit(f"no such parameter: {args.param}")

    base = Run(utterances=PROBE[: args.utterances], voice=args.voice)
    print(f"probing {len(todo)} parameter(s) on {args.utterances} utterance(s), voice {args.voice}\n")
    print(f"  {'parameter':10} {'planted':>8} {'found':>8} {'span':>10}  verdict")

    for name, planted, grid in todo:
        r = recover(name, planted, grid, base=base)
        tol = (max(grid) - min(grid)) / (len(grid) - 1) / 2      # half a grid step
        span = max(r.error) - min(r.error)
        print(f"  {name:10} {planted:8g} {r.found:8g} {span:10.5f}  {verdict(r, tol)}")
        if args.param:
            print()
            for x, e in zip(r.grid, r.error):
                mark = "  <-- planted" if x == planted else ""
                print(f"      {x:8g}  {e:.6f}{mark}")


if __name__ == "__main__":
    main()
