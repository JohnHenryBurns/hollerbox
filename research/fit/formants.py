"""The speaker's own vowel formants, measured from the corpus audio at token midpoints.

Stage 0 needs the speaker's acoustics as well as their coils: `jointmap.py` asks for a reading of
the coils under which the tube reproduces THIS speaker's vowels, and the engine's posture table was
solved against Peterson & Barney's American men. This measures the target.

METHOD. Per token, a 25 ms Hamming window at the midpoint of the phone, pre-emphasised, LPC order 18
at 16 kHz, formants from the roots with bandwidth under 400 Hz. Per vowel, the median and the
interquartile range over up to 400 tokens of at least 80 ms — the shorter ones undershoot, and this
is meant to be the target a stressed, fully formed vowel aims at.

`lab/README.md` warns that LPC invents poles. That warning was earned on the SYNTHETIC tract, whose
impulse response is not the kind of signal LPC's all-pole model assumes; on real male speech at
16 kHz the root method is the standard tool, and a median over hundreds of tokens is robust to the
occasional spurious pole. Peak-picking the LPC envelope (`E1`, `E2`) agrees with the roots to
within a few Hz on every vowel, which is reported alongside so the agreement can be seen rather than
trusted.

    python -m fit.formants                      -> out/speaker_formants.csv
    python -m fit.formants --min-dur 0.05       shorter tokens too
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.io import wavfile
from scipy.linalg import solve_toeplitz
from scipy.signal import freqz

from .mngu0 import DATA, MONOPHTHONGS

REPO = Path(__file__).resolve().parents[2]
WAV = DATA / "mngu0_s1_wav_16kHz_1.1.0"
OUT = REPO / "research" / "out"


def lpc(x: np.ndarray, order: int) -> np.ndarray | None:
    r = np.correlate(x, x, "full")[len(x) - 1:len(x) + order]
    if r[0] <= 0:
        return None
    a = solve_toeplitz(r[:order], -r[1:order + 1])
    return np.concatenate([[1.0], a])


def roots_formants(a: np.ndarray, sr: int, max_bw: float = 400.0) -> np.ndarray:
    rts = np.roots(a)
    rts = rts[np.imag(rts) > 0]
    f = np.angle(rts) * sr / (2 * np.pi)
    bw = -0.5 * sr / (2 * np.pi) * np.log(np.abs(rts))
    keep = (f > 90) & (f < 5000) & (bw < max_bw)
    return np.sort(f[keep])


def envelope_peaks(a: np.ndarray, sr: int) -> np.ndarray:
    w, h = freqz(1, a, worN=2048, fs=sr)
    m = 20 * np.log10(np.abs(h) + 1e-12)
    return np.array([w[i] for i in range(1, len(m) - 1)
                     if m[i] > m[i - 1] and m[i] >= m[i + 1] and 90 < w[i] < 5000])


def measure(tokens: pd.DataFrame, per_vowel: int = 400, order: int = 18, win: float = 0.025,
            seed: int = 1) -> pd.DataFrame:
    """One row per measured token: phone, dur, F1..F3 from the roots, E1..E2 from the envelope."""
    sample = (tokens.groupby("phone", group_keys=False)[tokens.columns]
              .apply(lambda g: g.sample(min(len(g), per_vowel), random_state=seed)))
    cache: dict[str, tuple[int, np.ndarray]] = {}
    rows = []
    for _, t in sample.iterrows():
        if t.utt not in cache:
            sr, x = wavfile.read(WAV / f"{t.utt}.wav")
            cache[t.utt] = (sr, x.astype(float) / 32768.0)
        sr, x = cache[t.utt]
        half = int(0.5 * win * sr)
        c = int(0.5 * (t.start + t.end) * sr)
        if c - half < 0 or c + half > len(x):
            continue
        seg = x[c - half:c + half]
        seg = np.append(seg[0], seg[1:] - 0.97 * seg[:-1]) * np.hamming(len(seg))
        a = lpc(seg, order)
        if a is None:
            continue
        fr, fe = roots_formants(a, sr), envelope_peaks(a, sr)
        row = {"utt": t.utt, "phone": t.phone, "dur": t.dur}
        for k in range(3):
            row[f"F{k + 1}"] = fr[k] if k < len(fr) else np.nan
        for k in range(2):
            row[f"E{k + 1}"] = fe[k] if k < len(fe) else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def summarise(F: pd.DataFrame) -> pd.DataFrame:
    g = F.groupby("phone")
    out = g[["F1", "F2", "F3"]].median()
    q = g[["F1", "F2"]].quantile(0.75) - g[["F1", "F2"]].quantile(0.25)
    out["F1_iqr"], out["F2_iqr"] = q["F1"], q["F2"]
    out["E1"], out["E2"] = g["E1"].median(), g["E2"].median()
    out["n"] = g.size()
    return out.round(0)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokens", type=Path, default=OUT / "mngu0_tokens.csv")
    ap.add_argument("--out", type=Path, default=OUT / "speaker_formants.csv")
    ap.add_argument("--min-dur", type=float, default=0.08)
    ap.add_argument("--max-rms", type=float, default=10.0)
    ap.add_argument("--per-vowel", type=int, default=400)
    args = ap.parse_args()

    tok = pd.read_csv(args.tokens)
    v = tok[tok.phone.isin(MONOPHTHONGS) & (tok.dur >= args.min_dur) & (tok.rms_max <= args.max_rms)]
    F = measure(v, per_vowel=args.per_vowel)
    S = summarise(F).loc[[c for c in MONOPHTHONGS if c in F.phone.unique()]]
    pd.set_option("display.width", 200)
    print(f"{len(F)} tokens of at least {args.min_dur * 1000:.0f} ms\n")
    print(S.to_string())
    d = (S["E1"] - S["F1"]).abs().max(), (S["E2"] - S["F2"]).abs().max()
    print(f"\nroots vs envelope peaks: worst disagreement F1 {d[0]:.0f} Hz, F2 {d[1]:.0f} Hz")
    S.reset_index().to_csv(args.out, index=False)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
