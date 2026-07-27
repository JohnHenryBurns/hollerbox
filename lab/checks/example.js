// The load path itself, checked. If the directory stops being read, or `check` stops being in
// scope inside it, every file here goes silently missing — and a check that is not running looks
// exactly like a check that is passing.
check("the checks directory is being loaded", () => {
  const fs = require("fs"), path = require("path");
  const files = fs.readdirSync(path.join(__dirname))
                  .filter(f => f.endsWith(".js"));
  return { ok: files.length > 0 && typeof H === "object",
           note: `${files.length} file(s) in lab/checks, harness in scope` };
});
