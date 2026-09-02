# data

**Gitignored except this file.** Nothing measured is committed.

mngu0 is distributed on the condition that it is not passed on to other prospective users, and
MOCHA's licence is non-commercial and requires its `LICENCE.txt` to travel with the data. Putting
either on third-party infrastructure may breach them, which is also why the fitting runs locally
rather than on a cloud VM — `RESEARCH.md` argues that at more length.

Only what is *fitted* from a corpus gets committed. That is the same split `lab/RECORDING.md`
applies to the reference recording, and for the same reason.

## Where each one comes from

| corpus | where | how |
|---|---|---|
| **mngu0** | `homepages.inf.ed.ac.uk/korin/site/research/mngu0/` | email Korin Richmond with name, organisation, country, sector and intended use; manual approval, then per-file links by email |
| **SPIRE-EMA** | `huggingface.co/datasets/SpireLab/SPIRE_EMA_CORPUS` | CC BY 4.0, no registration |
| **MOCHA-TIMIT** | `data.cstr.ed.ac.uk/mocha/` | open directory, no registration |
| **USC-TIMIT** | `zenodo.org/records/19422914` | CC BY 4.0 since spring 2026; the old form is gone |

**mngu0 is not at `mngu0.org`.** That domain lapsed and now serves an unrelated Korean phonetics
blog. It still returns HTTP 200, so a link-checker will not flag it.

**HPRC is not obtainable.** Every paper citing the Haskins rate-comparison corpus points at a Box
link that 404s, and Yale Dataverse holds no articulatory datasets at all. It is the only public
corpus with a deliberate rate contrast, so it is worth an email to Mark Tiede rather than a
download — but do not plan around having it.

## The layout, as it is

The archives each unpack into a folder of their own name; those are flattened one level so the files
sit directly under the package directory. `fit/mngu0.py` reads this layout.

    data/
      mngu0/
        mngu0_s1_ema_basic_1.1.0/     1,354 EST_Track files, 200 Hz, 87 channels: eight coils with
                                      3-D position, orientation, rms fit error and a flag; head
                                      movement already removed. THE ONE THE FITTING READS.
        mngu0_s1_ema_norm_1.0.1/      1,263 files: the six speech coils as 12 midsagittal channels
                                      plus deltas, 3-frame smoothed, z-scored, silence-trimmed. Used
                                      only to check the axis convention (tests/test_mngu0.py).
        mngu0_s1_lab_1.1.1/           forced alignments: .lab (Combilex phone, end time) and .utt
                                      (Festival structure with the prompt text and words), a symbol
                                      list and the symbol table PDF
        mngu0_s1_wav_16kHz_1.1.0/     the audio, 16 kHz, EMA transmitter noise filtered out
        mngu0_s1_lsf_norm_1.0.1/      LSF parameterisation of the audio, context-windowed; not used
        mngu0_s1_ema_filesets_1.0.0/  the standard 1137 / 63 / 63 train / validation / test split
        mngu0_tools_1.0.0/            Korin Richmond's EST_Track readers (Python 2, MATLAB)
        mri_ref/                      the studio dry-run audio and prompt alignments for the MRI
                                      session: static and dynamic prompt lists, standing and supine

The MRI volumes stay as ISOs in `C:\mngu0` and are mounted when needed (`Mount-DiskImage`). The
static set is 31 series of 26 sagittal slices, 256 x 256 at 1.09 mm, 4 mm thick: one volume per
sustained prompt — twelve vowels in /hVt/ frames, the fricatives, nasals, liquids, three stops and
two rest postures. The midsagittal slice is the one nearest x = 0 (slice 13 of 26). The airway is
black against grey tissue from lips to larynx and the tongue shapes differ visibly between vowels.

## What the coordinates are

Coil positions are in **cm**, origin at the upper-incisor reference coil, head-corrected. In the
basic files `px` is lateral, `py` runs front to back and `pz` up. **`py` increases toward the back**
— the dorsum coil sits at +5.4, the lips at −1.0 — and this is the convention every published mngu0
number uses, so it is kept rather than flipped. `fit/mngu0.py` calls these x and y.

Two coils are worth knowing about before trusting a frame: each coil carries an `rms` fit error, and
the token table keeps the worst of the six over each token as `rms_max`. The median is 3.2 and the
99th percentile 8.8; nothing here has yet needed to drop frames on it.
