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

## Suggested layout

    data/
      mngu0/
        ema/        the processed 200 Hz trackfiles
        wav/
        lab/        the Multisyn/Combilex forced alignments
      spire/

Nothing in `fit/` assumes this; it is here so that two people arriving at it separately do not
invent two different layouts.
