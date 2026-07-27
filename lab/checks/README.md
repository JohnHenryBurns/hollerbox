# One check, one file

A new check goes here, in its own file, and is picked up automatically:

```js
// lab/checks/whatever-it-is.js
check("what must be true", () => {
  const bad = [];
  // ...
  return { ok: bad.length === 0, note: bad.join("  ") || "what it measured" };
});
```

`check`, `report` and `H` (the harness) are in scope. Nothing needs importing and nothing needs
registering.

**Why this exists.** Every check used to be appended to one anchor in `lab/check.js`, and that
append point cost three merge conflicts in a week — always the same file, always the same anchor,
and **not** always the same resolution. Twice both sides ended unclosed and shared the trailing
`});`, so keeping both meant adding one. Once one side closed itself and the other did not, and
adding one broke the parse.

A convention that needs both sides read carefully is one that will eventually be applied
carelessly. Two branches adding a check now touch two different files and there is nothing to
resolve.

The checks already in `check.js` stay there. Moving them would be a large diff for no benefit:
the conflicts came from the append point, and there is no longer one.
