"""Stage 1 of RESEARCH.md: how far does target-and-interpolate get?

The model is driven from the corpus's OWN phone string with the corpus's OWN segment durations
(`lab/trajectories.js --seg`, `buildWord`'s `durs`), so the two trajectories share a clock and the
only thing under test is what the tract does between the boundaries a speaker actually produced.
The targets are the Edinburgh voice: this speaker's vowel postures through the fixed stage 0 map,
the shared consonants. The measured trajectory is the same map applied to the coils frame by
frame. Both are then compared in the engine's own space.

TWO SPACES, ONE FOR EACH JOB. The search compares DIAMETERS: the measured posture forward-mapped
through `articulate` once and cached, against the tube's diameters read straight off the running
engine (`--diam`). That avoids the posture inversion, which was 95% of a corpus pass, inside the
loop. The report compares POSTURES: the model's diameters inverted back to six parameters
(`--actual`) against the measured six, so the headline is variance explained per articulator,
which is the number the plan asks for and the one a phonetician can read.

WHERE THE MAP IS TRUSTED. The stage 0 map was fitted on vowel means. Applied to a stop closure it
extrapolates linearly from vowels and never closes — the coils do not know the tongue is pressed
into the palate. So the objective is taken over VOWEL frames, where the map was validated, and the
report gives both vowel-frame and all-frame numbers with that caveat stated. Consonant targets still
shape the trajectory into and out of every vowel, which is where coarticulation lives.

THE BASELINES THAT MAKE THE NUMBER MEAN SOMETHING.
  hold       the current segment's target posture, held flat — target with no interpolation
  phone-mean this speaker's own mean posture per phone, from the training set — the best any
             lookup table can do, and the ceiling a static model has to be measured against
  defaults   the engine as shipped; fitted   the five gesture parameters and the glide fitted here
  no-mass    artT = 0: pure keyframe interpolation in area space, no follower

    python -m fit.stage1 prepare                    seg files, measured tracks, cached diameters
    python -m fit.stage1 objective                  one evaluation at the defaults, timed
    python -m fit.stage1 fit --train 120            coordinate descent on the gesture parameters
    python -m fit.stage1 report                     held-out R² per articulator, baselines, residuals
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from .mngu0 import DATA, LAB, filesets, read_lab, sensors, utterances

REPO = Path(__file__).resolve().parents[2]
RUNNER = REPO / "lab" / "trajectories.js"
POSTURE = REPO / "lab" / "posture.js"
OUT = REPO / "research" / "out" / "stage1"
MAP = REPO / "research" / "fit" / "mngu0_map.json"
VOICE = "mngu0"

ARTS = ["jaw", "bodyPos", "bodyHi", "tipPos", "tipHi", "lip"]

#: Combilex -> engine symbols. A list splits one label into two chain symbols (affricates), with
#: the second entry's share of the duration.
COMBILEX = {
    "i": "i", "I": "ɪ", "E": "ɛ", "a": "æ", "V": "ʌ", "A": "ɑ", "O": "ɔ", "U": "ʊ", "u": "u",
    "@@": "ɝ", "@": "ə", "Q": "ɒ",
    "eI": "eɪ", "aI": "aɪ", "OI": "ɔɪ", "aU": "aʊ", "@U": "oʊ",
    # centring diphthongs have no engine counterpart; the first element is the nucleus
    "I@": "ɪ", "E@": "ɛ", "U@": "ʊ", "o^": "ɔ",
    "p": "p", "t": "t", "k": "k", "b": "b", "d": "d", "g": "g",
    "m": "m", "n": "n", "N": "ŋ", "m!": "m", "n!": "n",
    "T": "θ", "D": "ð", "f": "f", "v": "v", "s": "s", "z": "z", "S": "ʃ", "Z": "ʒ", "h": "h",
    "tS": [("t", 0.4), ("ʃ", 0.6)], "dZ": [("d", 0.4), ("ʒ", 0.6)],
    "l": "l", "lw": "l", "l!": "l", "r": "r", "j": "j", "w": "w",
    "x": "k",                     # LOCH, twice in the corpus; the engine has no velar fricative
    "#": " ",
}
VOWELS_CX = {"i", "I", "E", "a", "V", "A", "O", "U", "u", "@@", "@", "Q",
             "eI", "aI", "OI", "aU", "@U", "I@", "E@", "U@", "o^"}

#: the gesture parameters the plan names as fittable (velT is not: research/README.md), plus the
#: transition time, which is the one planner parameter that shapes movement. Bounds from VOICE_SPEC.
PARAMS = {"artT": (0.0, 0.06), "artCrit": (0.0, 4.0), "artStiff": (0.1, 1.0),
          "artPush": (0.0, 1.0), "artFar": (0.0, 3.0), "glide": (0.03, 0.22)}


# ───────────────────────── the corpus side ─────────────────────────

def read_utt_structure(utt: str) -> list[dict]:
    """Per labelled segment, in order: stress (0/1), word index, syllable index, position in word.

    From the Festival utterance structure: Stream_Items carry `stress` on syllables and `end` on
    segments; the SylStructure relation links word -> syllable -> segment. Relation lines are
    `node item up down next prev`. Silences are not in the structure and get stress 0, word -1.
    """
    text = (LAB / f"{utt}.utt").read_text(encoding="latin1")
    items: dict[int, dict] = {}
    m = re.search(r"Stream_Items\n(.*?)End_of_Stream_Items", text, re.S)
    for line in m.group(1).splitlines():
        parts = line.split(" ; ")
        head = parts[0].split()
        if len(head) < 3:
            continue
        item = {"id": int(head[0])}
        for p in parts:
            kv = p.strip().split(" ", 1)
            if len(kv) == 2:
                item[kv[0]] = kv[1].strip()
        items[item["id"]] = item
    rel = re.search(r"Relation SylStructure ; \(\)\n(.*?)End_of_Relation", text, re.S)
    nodes: dict[int, tuple[int, int, int]] = {}
    for line in rel.group(1).splitlines():
        f = line.split()
        if len(f) == 6:
            nodes[int(f[0])] = (int(f[1]), int(f[2]), int(f[5]))       # item, up, prev
    segs = [it for it in items.values() if "end" in it]
    seg_node = {nodes[k][0]: k for k in nodes if nodes[k][0] in {s["id"] for s in segs}}
    out = []
    word_of_syl: dict[int, int] = {}
    words: list[int] = []
    # Only the FIRST daughter of a node carries the `up` link; its sisters chain back to it through
    # `prev`. So a phone in the middle of a syllable, and a syllable in the middle of a word, has
    # up = 0 and has to walk back to the head to find its parent.
    def head(node: int) -> int:
        while nodes[node][1] == 0 and nodes[node][2] != 0:
            node = nodes[node][2]
        return node

    for s in segs:
        row = {"name": s["name"], "end": float(s["end"]), "stress": 0, "word": -1, "syl": -1}
        node = seg_node.get(s["id"])
        if node is not None:
            syl_node = nodes[head(node)][1]
            word_node = nodes[head(syl_node)][1] if syl_node in nodes else 0
            syl_item = items[nodes[syl_node][0]] if syl_node in nodes else {}
            row["stress"] = int(syl_item.get("stress", "0") or 0)
            row["syl"] = syl_node
            if word_node:
                if word_node not in words:
                    words.append(word_node)
                row["word"] = words.index(word_node)
        out.append(row)
    # position in word: 0 at the first phone of the word, 1 at the last
    for w in set(r["word"] for r in out if r["word"] >= 0):
        idx = [i for i, r in enumerate(out) if r["word"] == w]
        for k, i in enumerate(idx):
            out[i]["in_word"] = k / max(1, len(idx) - 1)
    for r in out:
        r.setdefault("in_word", float("nan"))
    return out


def seg_line(utt: str) -> tuple[str, dict]:
    """The `--seg` line for one utterance and the bookkeeping to join it back to the corpus."""
    labs = read_lab(utt)
    struct = read_utt_structure(utt)
    if len(struct) != len(labs) or any(s["name"] != l[2] for s, l in zip(struct, labs)):
        raise ValueError(f"{utt}: .utt segments do not match .lab")
    # drop the leading and trailing silences; the model has its own lead-in
    first = next(i for i, (_, _, ph) in enumerate(labs) if ph != "#")
    last = max(i for i, (_, _, ph) in enumerate(labs) if ph != "#")
    toks, chain_map = [], []
    for i in range(first, last + 1):
        a, b, ph = labs[i]
        dur = b - a
        eng = COMBILEX.get(ph)
        if eng is None:
            raise ValueError(f"{utt}: no engine symbol for {ph}")
        st = struct[i]["stress"]
        parts = eng if isinstance(eng, list) else [(eng, 1.0)]
        for sym, share in parts:
            toks.append(f"{'_' if sym == ' ' else sym}/{dur * share:.4f}" + ("/1" if st else ""))
            chain_map.append(i)
    info = {"utt": utt, "t0": labs[first][0], "first": first, "last": last, "chain_seg": chain_map,
            "labs": [{"a": a, "b": b, "ph": ph, "stress": s["stress"], "word": s["word"],
                      "in_word": s["in_word"]} for (a, b, ph), s in zip(labs, struct)]}
    return f"{utt}\t{' '.join(toks)}", info


def load_map() -> dict:
    return json.loads(MAP.read_text(encoding="utf-8"))


def measured_track(utt: str, mp: dict) -> pd.DataFrame:
    """The coils, frame by frame, read into posture space through the fixed map."""
    S = sensors(utt)
    # A coil the tracker lost for a few frames is NaN in the trackfile. Bridge the gap linearly so
    # the frame count stays the corpus's; the gaps are short and `rms_max` records the doubt.
    S = S.interpolate(limit_direction="both")
    S["lipap"] = S["UL_y"] - S["LL_y"]
    out = pd.DataFrame({"t": S["t"]})
    for p in ARTS:
        m = mp["map"][p]
        out[p] = np.clip(m["intercept"] + m["slope"] * S[m["from"]], 0.0, 1.0)
    labs = read_lab(utt)
    ends = np.array([b for _, b, _ in labs])
    idx = np.clip(np.searchsorted(ends, out["t"].to_numpy(), side="left"), 0, len(labs) - 1)
    out["seg"] = idx
    out["phone"] = [labs[i][2] for i in idx]
    out["vowel"] = out["phone"].isin(VOWELS_CX)
    return out


def articulate_batch(postures: np.ndarray, n: int) -> np.ndarray:
    if not np.isfinite(postures).all():
        raise ValueError("a posture is not finite; the coil track has a gap the interpolation did not bridge")
    payload = [dict(zip(ARTS, map(float, row))) for row in postures]
    done = subprocess.run(["node", str(POSTURE), "--articulate", "--n", str(n)], input=json.dumps(payload),
                          capture_output=True, text=True, cwd=REPO, encoding="utf-8")
    if done.returncode != 0:
        raise RuntimeError(f"posture.js: {done.stderr.strip()[:300]}")
    return np.array(json.loads(done.stdout), dtype=np.float32)


def voice_sections() -> int:
    done = subprocess.run(["node", "-e", f"const P=require('./engine/phonemes.js');console.log(P.VOICES['{VOICE}'].v.sect)"],
                          capture_output=True, text=True, cwd=REPO, check=True)
    return int(round(float(done.stdout.strip())))


def prepare(args) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "measured").mkdir(exist_ok=True)
    mp = load_map()
    n = voice_sections()
    utts = utterances()
    if args.limit:
        utts = utts[: args.limit]
    lines, infos, bad = [], {}, []
    t0 = time.time()
    for k, utt in enumerate(utts):
        try:
            line, info = seg_line(utt)
        except Exception as e:                       # noqa: BLE001 — record and move on
            bad.append(f"{utt}: {e}")
            continue
        lines.append(line)
        infos[utt] = info
        M = measured_track(utt, mp)
        D = articulate_batch(M[ARTS].to_numpy(), n)
        np.savez_compressed(OUT / "measured" / f"{utt}.npz", t=M["t"].to_numpy(np.float32),
                            A=M[ARTS].to_numpy(np.float32), D=D, seg=M["seg"].to_numpy(np.int16),
                            vowel=M["vowel"].to_numpy())
        if k % 100 == 0:
            print(f"  {k}/{len(utts)} {utt}  {time.time() - t0:.0f} s", flush=True)
    (OUT / "segs.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "segs.json").write_text(json.dumps(infos), encoding="utf-8")
    (OUT / "prepare.log").write_text("\n".join(bad) + "\n", encoding="utf-8")
    print(f"{len(lines)} utterances prepared, {len(bad)} skipped (see prepare.log); sections {n}")


# ───────────────────────── the model side ─────────────────────────

#: corpus phone -> the engine symbol whose target it should set, for the speaker-targets file.
#: Diphthongs are left to the engine (two targets from the vowel table); affricates to their parts.
TARGET_SYMBOL = {c: e for c, e in COMBILEX.items()
                 if isinstance(e, str) and e not in (" ", "eɪ", "aɪ", "ɔɪ", "aʊ", "oʊ")}


def speaker_targets(corpus: "Corpus", train: list[str], path: Path) -> dict:
    """This speaker's mean measured posture per engine symbol, from the training utterances.

    The stage 0 map was fitted on vowels, so for a consonant this is an extrapolation and it never
    closes; as an acoustic target it would be wrong. As the place a transition starts from and
    returns to, it is where the coils say the speaker's tongue, jaw and lips actually were, which
    is the one thing the shared table is known not to be.
    """
    acc: dict[str, list[np.ndarray]] = {}
    for u in train:
        M = corpus.measured(u)
        labs = corpus.info[u]["labs"]
        ph = np.array([labs[s]["ph"] for s in M["seg"]])
        for c, e in TARGET_SYMBOL.items():
            sel = ph == c
            if sel.any():
                acc.setdefault(e, []).append(M["A"][sel])
    art = {e: dict(zip(ARTS, map(float, np.concatenate(v).mean(axis=0)))) for e, v in acc.items()}
    path.write_text(json.dumps(art, indent=1, ensure_ascii=False), encoding="utf-8")
    return art


class Corpus:
    """The prepared utterances: seg lines, join info, measured tracks."""

    def __init__(self, utts: list[str] | None = None, art: Path | None = None):
        seg_lines = (OUT / "segs.txt").read_text(encoding="utf-8").splitlines()
        self.lines = {l.split("\t", 1)[0]: l for l in seg_lines if l.strip()}
        self.info = json.loads((OUT / "segs.json").read_text(encoding="utf-8"))
        self.utts = [u for u in (utts or list(self.lines)) if u in self.lines]
        self.art = art
        self._meas: dict[str, dict] = {}

    def measured(self, utt: str) -> dict:
        if utt not in self._meas:
            z = np.load(OUT / "measured" / f"{utt}.npz")
            self._meas[utt] = {k: z[k] for k in z.files}
        return self._meas[utt]

    def run(self, utts: list[str], overrides: dict[str, float], actual: bool, jobs: int,
            keep: Path | None = None) -> pd.DataFrame:
        """trajectories.js over `utts`, split across `jobs` processes; the concatenated CSV."""
        chunks = [utts[i::jobs] for i in range(jobs)]
        chunks = [c for c in chunks if c]
        tmp = tempfile.mkdtemp(prefix="stage1_")
        procs = []
        for i, c in enumerate(chunks):
            src = Path(tmp) / f"in{i}.txt"
            src.write_text("\n".join(self.lines[u] for u in c) + "\n", encoding="utf-8")
            cmd = ["node", str(RUNNER), "--in", str(src), "--out", str(Path(tmp) / f"out{i}.csv"),
                   "--voice", VOICE, "--rate", "200", "--seg", "--diam"]
            if actual:
                cmd.append("--actual")
            if self.art:
                cmd += ["--art", str(self.art)]
            if overrides:
                cmd += ["--set", ",".join(f"{k}={v}" for k, v in overrides.items())]
            procs.append(subprocess.Popen(cmd, cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True))
        frames = []
        for i, p in enumerate(procs):
            _, err = p.communicate()
            if p.returncode != 0:
                raise RuntimeError(f"trajectories.js failed: {err.strip()}")
            frames.append(pd.read_csv(Path(tmp) / f"out{i}.csv"))
        df = pd.concat(frames, ignore_index=True)
        if keep:
            df.to_csv(keep, index=False)
        for f in Path(tmp).iterdir():
            f.unlink()
        Path(tmp).rmdir()
        return df

    def align(self, utt: str, model: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """Indices into the measured frames for each model frame, and the mask of frames that land."""
        t0 = self.info[utt]["t0"]
        meas_t = self.measured(utt)["t"]
        tc = model["t"].to_numpy() + t0
        idx = np.rint((tc - meas_t[0]) / 0.005).astype(int)
        ok = (idx >= 0) & (idx < len(meas_t))
        return np.clip(idx, 0, len(meas_t) - 1), ok


def objective(corpus: Corpus, utts: list[str], overrides: dict[str, float], jobs: int,
              n: int) -> tuple[float, float, int]:
    """RMS diameter difference over vowel frames (and over all frames), model vs measured."""
    df = corpus.run(utts, overrides, actual=False, jobs=jobs)
    dcols = [f"d_{i}" for i in range(n)]
    ss_v = ss_a = 0.0
    n_v = n_a = 0
    for utt, g in df.groupby("utt", sort=False):
        idx, ok = corpus.align(utt, g)
        M = corpus.measured(utt)
        D = g[dcols].to_numpy(np.float32)[ok]
        Dm = M["D"][idx[ok]]
        vow = M["vowel"][idx[ok]]
        e2 = ((D - Dm) ** 2).sum(axis=1)
        ss_a += float(e2.sum()); n_a += e2.size * n
        ss_v += float(e2[vow].sum()); n_v += int(vow.sum()) * n
    return np.sqrt(ss_v / max(1, n_v)), np.sqrt(ss_a / max(1, n_a)), n_v // n


def defaults() -> dict[str, float]:
    done = subprocess.run(["node", "-e",
                           f"const P=require('./engine/phonemes.js');const v={{...P.defaultVoice(),...P.VOICES['{VOICE}'].v}};"
                           f"console.log(JSON.stringify(Object.fromEntries({json.dumps(list(PARAMS))}.map(k=>[k,v[k]]))))"],
                          capture_output=True, text=True, cwd=REPO, check=True)
    return json.loads(done.stdout)


MRI_ART = REPO / "research" / "out" / "mri" / "mri_art.json"
VOWEL_SYMBOLS = {"i", "ɪ", "ɛ", "æ", "ʌ", "ɑ", "ɔ", "ʊ", "u", "ɝ", "ə", "ɒ", "o"}


def targets_path(which: str) -> Path | None:
    """Where each target set's posture file is; the MRI sets are cut from fit/mri_fit.py's output."""
    if which == "speaker":
        return OUT / "speaker_art.json"
    if which in ("mri-cons", "mri-all") and MRI_ART.exists():
        art = json.loads(MRI_ART.read_text(encoding="utf-8"))["art"]
        if which == "mri-cons":
            art = {k: v for k, v in art.items() if k not in VOWEL_SYMBOLS}
        dest = OUT / f"{which}_art.json"
        dest.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
        return dest
    return None


def fit(args) -> None:
    corpus = Corpus()
    fs = filesets()
    train = [u for u in fs["train"] if u in corpus.lines][: args.train]
    if args.targets == "speaker":
        speaker_targets(corpus, [u for u in fs["train"] if u in corpus.lines][:300], targets_path("speaker"))
        corpus.art = targets_path("speaker")
    n = voice_sections()
    x = defaults()
    names = list(PARAMS)
    step = {k: (PARAMS[k][1] - PARAMS[k][0]) * 0.15 for k in names}
    t0 = time.time()
    best, _, nv = objective(corpus, train, x, args.jobs, n)
    print(f"{len(train)} training utterances, {nv} vowel frames; defaults {x}\n"
          f"  start: vowel-frame diameter rms {best:.4f}  ({time.time() - t0:.0f} s an evaluation)", flush=True)
    history = [{"round": 0, **x, "rms": best}]
    for r in range(args.rounds):
        moved = False
        for k in names:
            for sgn in (+1, -1):
                xt = dict(x)
                xt[k] = float(np.clip(x[k] + sgn * step[k], *PARAMS[k]))
                if xt[k] == x[k]:
                    continue
                f, _, _ = objective(corpus, train, xt, args.jobs, n)
                if f < best - 1e-6:
                    x, best, moved = xt, f, True
                    print(f"  round {r + 1}: {k} -> {x[k]:.4f}   rms {best:.4f}", flush=True)
                    break
        if not moved:
            for k in names:
                step[k] *= 0.5
            print(f"  round {r + 1}: no move, steps halved (artT step {step['artT']:.4f})", flush=True)
        history.append({"round": r + 1, **x, "rms": best})
        if step["artT"] < 0.0005:
            break
    OUT.mkdir(exist_ok=True)
    dest = OUT / f"fitted_{args.targets}.json"
    dest.write_text(json.dumps({"params": x, "train": train, "rms": best, "targets": args.targets,
                                "defaults": defaults(), "history": history}, indent=1), encoding="utf-8")
    print(f"\nfitted {x}\n  rms {best:.4f}; wrote {dest}  ({time.time() - t0:.0f} s)")


# ───────────────────────── the report ─────────────────────────

def posture_table(corpus: Corpus, utts: list[str], overrides: dict[str, float], jobs: int,
                  label: str, keep: Path | None = None) -> pd.DataFrame:
    """Frames with measured and modelled postures side by side, plus the linguistic columns."""
    df = corpus.run(utts, overrides, actual=True, jobs=jobs, keep=keep)
    rows = []
    for utt, g in df.groupby("utt", sort=False):
        idx, ok = corpus.align(utt, g)
        M = corpus.measured(utt)
        info = corpus.info[utt]
        g = g[ok].copy()
        ii = idx[ok]
        for p in ARTS:
            g[f"meas_{p}"] = M["A"][ii, ARTS.index(p)]
        g["cx_seg"] = M["seg"][ii]
        labs = info["labs"]
        g["cx_phone"] = [labs[s]["ph"] for s in g["cx_seg"]]
        g["cx_stress"] = [labs[s]["stress"] for s in g["cx_seg"]]
        g["cx_word"] = [labs[s]["word"] for s in g["cx_seg"]]
        g["cx_in_word"] = [labs[s]["in_word"] for s in g["cx_seg"]]
        tc = g["t"].to_numpy() + info["t0"]
        a = np.array([labs[s]["a"] for s in g["cx_seg"]]); b = np.array([labs[s]["b"] for s in g["cx_seg"]])
        g["cx_pos_in_seg"] = np.clip((tc - a) / np.maximum(1e-6, b - a), 0, 1)
        g["cx_seg_dur"] = b - a
        g["vowel"] = M["vowel"][ii]
        g["model"] = label
        rows.append(g)
    return pd.concat(rows, ignore_index=True)


def r2_table(T: pd.DataFrame, pred_prefix: str, mask: np.ndarray) -> dict[str, float]:
    out = {}
    for p in ARTS:
        y = T.loc[mask, f"meas_{p}"].to_numpy(float)
        yhat = T.loc[mask, f"{pred_prefix}{p}"].to_numpy(float)
        ss_res = float(((y - yhat) ** 2).sum()); ss_tot = float(((y - y.mean()) ** 2).sum())
        out[p] = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return out


#: the tract in five regions, by normalised position from the glottis. The diameter comparison is
#: reported per region because that is what is well-posed: a posture parameter can be invisible in
#: the diameters (a flat tip hump has no position), a diameter never is.
REGIONS = [("pharynx", 0.0, 0.30), ("velar", 0.30, 0.55), ("palatal", 0.55, 0.75),
           ("alveolar", 0.75, 0.92), ("lips", 0.92, 1.01)]


def r2_diam(Dm: np.ndarray, Dp: np.ndarray, n: int) -> dict[str, float]:
    """R² of predicted diameters against measured ones, per tract region and overall."""
    u = np.arange(n) / (n - 1)
    out = {}
    for name, lo, hi in REGIONS + [("all", 0.0, 1.01)]:
        cols = (u >= lo) & (u < hi)
        y, yhat = Dm[:, cols].ravel(), Dp[:, cols].ravel()
        ss_res = float(((y - yhat) ** 2).sum()); ss_tot = float(((y - y.mean()) ** 2).sum())
        out[name] = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return out


def report(args) -> None:
    corpus = Corpus()
    fs = filesets()
    test = [u for u in fs["test"] if u in corpus.lines]
    train = [u for u in fs["train"] if u in corpus.lines][: args.train]
    dflt = defaults()
    # Two target sets, three dynamics each. "engine" is the Edinburgh voice as shipped — the
    # speaker's vowels, the shared consonants. "speaker" is his own mean posture for every phone.
    speaker_targets(corpus, train, targets_path("speaker"))
    models: dict[str, tuple[Path | None, dict]] = {}
    # "mri-cons": the speaker's vowels through the map, his consonants fitted to his MRI (fit/mri_fit.py);
    # "mri-all": every phone fitted to the MRI. Both are scored at the defaults and at the parameters
    # fitted on the speaker targets, so the comparison isolates the targets.
    spk_fit = OUT / "fitted_speaker.json"
    spk_params = json.loads(spk_fit.read_text(encoding="utf-8"))["params"] if spk_fit.exists() else None
    for tset in ("engine", "speaker", "mri-cons", "mri-all"):
        path = targets_path(tset)
        if tset.startswith("mri") and path is None:
            continue
        models[f"{tset} · defaults"] = (path, dflt)
        if tset in ("engine", "speaker"):
            models[f"{tset} · no-mass"] = (path, {**dflt, "artT": 0.0})
        f = OUT / f"fitted_{tset}.json"
        if f.exists():
            models[f"{tset} · fitted"] = (path, json.loads(f.read_text(encoding="utf-8"))["params"])
        elif spk_params and tset.startswith("mri"):
            models[f"{tset} · speaker-fitted params"] = (path, spk_params)
    pd.set_option("display.width", 200)

    # engine postures per symbol, for the hold baseline: the voice's own table over the shared one
    art = json.loads(subprocess.run(["node", "-e",
        f"const P=require('./engine/phonemes.js');console.log(JSON.stringify({{...P.ART,...(P.VOICES['{VOICE}'].art||{{}})}}))"],
        capture_output=True, text=True, cwd=REPO, check=True, encoding="utf-8").stdout)

    tables = {}
    for name, (artp, ov) in models.items():
        t0 = time.time()
        corpus.art = artp
        T = posture_table(corpus, test, ov, args.jobs, name)
        print(f"  {name}: {len(T)} frames on {len(test)} held-out utterances ({time.time() - t0:.0f} s)", flush=True)
        tables[name] = T
    corpus.art = None
    T0 = tables["engine · defaults"]

    # baseline: hold the current segment's target
    def target_of(ph):
        eng = COMBILEX.get(ph, "ə")
        if isinstance(eng, list):
            eng = eng[-1][0]
        if eng == " ":
            eng = "ə"
        A = art.get(eng) or art.get({"eɪ": "ɛ", "aɪ": "ɑ", "ɔɪ": "ɔ", "aʊ": "ɑ", "oʊ": "o"}.get(eng, "ə"))
        return A
    hold = pd.DataFrame([target_of(ph) for ph in T0["cx_phone"]])
    for p in ARTS:
        T0[f"hold_{p}"] = hold[p].to_numpy()
    # baseline: this speaker's mean posture per phone, from training utterances
    means = {}
    for u in train:
        M = corpus.measured(u)
        labs = corpus.info[u]["labs"]
        ph = np.array([labs[s]["ph"] for s in M["seg"]])
        for c in np.unique(ph):
            means.setdefault(c, []).append(M["A"][ph == c])
    means = {c: np.concatenate(v).mean(axis=0) for c, v in means.items()}
    grand = np.mean(list(means.values()), axis=0)
    pm = np.array([means.get(ph, grand) for ph in T0["cx_phone"]])
    for i, p in enumerate(ARTS):
        T0[f"pmean_{p}"] = pm[:, i]
    # baseline: the mean posture given the phone AND its neighbours, from the training set, backing
    # off to the diphone and then the phone where a context was never seen. A lookup table that knows
    # its context is the ceiling for "coarticulation is a table"; how far it sits above the phone mean
    # is how much of the residual is structured by the neighbours at all, which is stage 2's question
    # asked of the data before any regression.
    ctx: dict[tuple, list[np.ndarray]] = {}
    for u in train:
        M = corpus.measured(u)
        labs = corpus.info[u]["labs"]
        segs = M["seg"]
        for s in np.unique(segs):
            key = (labs[s - 1]["ph"] if s > 0 else "#", labs[s]["ph"], labs[s + 1]["ph"] if s + 1 < len(labs) else "#")
            A = M["A"][segs == s]
            ctx.setdefault(key, []).append(A)
            ctx.setdefault((key[0], key[1], None), []).append(A)
            ctx.setdefault((None, key[1], key[2]), []).append(A)
    ctx_mean = {k: np.concatenate(v).mean(axis=0) for k, v in ctx.items()}
    def ctx_of(row):
        labs = corpus.info[row.utt]["labs"]; s = int(row.cx_seg)
        key = (labs[s - 1]["ph"] if s > 0 else "#", labs[s]["ph"], labs[s + 1]["ph"] if s + 1 < len(labs) else "#")
        for k in (key, (key[0], key[1], None), (None, key[1], key[2])):
            if k in ctx_mean:
                return ctx_mean[k]
        return means.get(key[1], grand)
    cm = np.array([ctx_of(r) for r in T0[["utt", "cx_seg"]].itertuples(index=False)])
    for i, p in enumerate(ARTS):
        T0[f"cmean_{p}"] = cm[:, i]

    # ---- the primary comparison: diameters, per tract region ----
    # The measured diameters are the map-read posture through `articulate`, cached by `prepare`;
    # the model's come straight off the running engine (`--diam`). The two static baselines are
    # forward-mapped the same way, once per phone.
    n = voice_sections()
    dcols = [f"d_{i}" for i in range(n)]
    Dm = np.zeros((len(T0), n), np.float32)
    pos = 0
    for u, g in T0.groupby("utt", sort=False):          # T0 keeps only frames that aligned
        idx, _ = corpus.align(u, g)
        Dm[pos:pos + len(g)] = corpus.measured(u)["D"][idx]
        pos += len(g)
    phones = sorted(set(T0["cx_phone"]))
    hold_D = dict(zip(phones, articulate_batch(np.array([list(target_of(ph).values()) for ph in phones]), n)))
    pm_D = dict(zip(phones, articulate_batch(np.array([means.get(ph, grand) for ph in phones]), n)))
    uniq, inv = np.unique(cm.round(5), axis=0, return_inverse=True)
    cm_D = articulate_batch(uniq, n)[inv.ravel()]
    static = {"hold target": np.stack([hold_D[ph] for ph in T0["cx_phone"]]),
              "phone mean (train)": np.stack([pm_D[ph] for ph in T0["cx_phone"]]),
              "context mean (train)": cm_D}

    drows, rows = [], []
    for frames, mask in [("vowel frames", T0["vowel"].to_numpy()), ("all frames", np.ones(len(T0), bool))]:
        for name, Dp in static.items():
            drows.append({"model": name, "frames": frames, **r2_diam(Dm[mask], Dp[mask], n)})
        for name, T in tables.items():
            if len(T) != len(T0):
                continue
            drows.append({"model": name, "frames": frames, **r2_diam(Dm[mask], T[dcols].to_numpy(np.float32)[mask], n)})
        rows.append({"model": "hold target", "frames": frames, **r2_table(T0, "hold_", mask)})
        rows.append({"model": "phone mean (train)", "frames": frames, **r2_table(T0, "pmean_", mask)})
        rows.append({"model": "context mean (train)", "frames": frames, **r2_table(T0, "cmean_", mask)})
        for name, T in tables.items():
            m = mask if len(T) == len(T0) else T["vowel"].to_numpy() if frames == "vowel frames" else np.ones(len(T), bool)
            rows.append({"model": name, "frames": frames, **r2_table(T, "act_", m)})
    RD = pd.DataFrame(drows)
    print("\n=== variance explained in DIAMETER space, held-out test set, by tract region (the well-posed comparison) ===")
    print(RD.round(3).to_string(index=False))
    RD.to_csv(OUT / "stage1_r2_diam.csv", index=False)
    R = pd.DataFrame(rows)
    R["mean"] = R[ARTS].mean(axis=1)
    print("\n=== variance explained per POSTURE parameter (model postures are inverted from the tube; a parameter the")
    print("    diameters do not pin inherits the plan — read tipPos and tipHi with that in mind) ===")
    print(R.round(3).to_string(index=False))
    R.to_csv(OUT / "stage1_r2.csv", index=False)

    # the residuals, for stage 2: the speaker-target model, fitted if it has been
    best = "speaker · fitted" if "speaker · fitted" in tables else "speaker · defaults"
    T = tables[best]
    for p in ARTS:
        T[f"res_{p}"] = T[f"meas_{p}"] - T[f"act_{p}"]
    keep = ["utt", "t", "cx_phone", "cx_seg", "cx_pos_in_seg", "cx_stress", "cx_word", "cx_in_word", "utt_pos",
            "cx_seg_dur", "n_phones", "vowel", "inv_rms", "clamped"] + [f"meas_{p}" for p in ARTS] + \
           [f"act_{p}" for p in ARTS] + [f"res_{p}" for p in ARTS]
    dest = OUT / f"residuals_test_{best.replace(' · ', '_')}.csv"
    T[keep].to_csv(dest, index=False)
    print(f"\nwrote {OUT / 'stage1_r2.csv'} and {dest} ({len(T)} frames)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prepare"); p.add_argument("--limit", type=int)
    p = sub.add_parser("objective"); p.add_argument("--train", type=int, default=60); p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    p.add_argument("--set", default="", help="k=v,k=v overrides")
    p.add_argument("--targets", choices=["engine", "speaker"], default="engine")
    p = sub.add_parser("fit"); p.add_argument("--train", type=int, default=120); p.add_argument("--rounds", type=int, default=10)
    p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    p.add_argument("--targets", choices=["engine", "speaker"], default="engine")
    p = sub.add_parser("report"); p.add_argument("--train", type=int, default=300); p.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    args = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    if args.cmd == "prepare":
        prepare(args)
    elif args.cmd == "objective":
        corpus = Corpus()
        train = [u for u in filesets()["train"] if u in corpus.lines][: args.train]
        if args.targets == "speaker":
            speaker_targets(corpus, [u for u in filesets()["train"] if u in corpus.lines][:300], targets_path("speaker"))
            corpus.art = targets_path("speaker")
        ov = defaults()
        for kv in filter(None, args.set.split(",")):
            k, v = kv.split("="); ov[k] = float(v)
        t0 = time.time()
        rv, ra, nv = objective(corpus, train, ov, args.jobs, voice_sections())
        print(f"{len(train)} utterances, {nv} vowel frames: rms {rv:.4f} (vowel frames), {ra:.4f} (all)  in {time.time() - t0:.1f} s  {ov}")
    elif args.cmd == "fit":
        fit(args)
    elif args.cmd == "report":
        report(args)


if __name__ == "__main__":
    main()
