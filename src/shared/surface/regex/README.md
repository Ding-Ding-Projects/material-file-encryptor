# Regex builder modules

The builder opens beside every search field (`mfe-search`). Each field mounts its own builder, with its
own expression state, undo history and saved expressions (storage key `mfe.regex.<scope>`).

| Module | Responsibility |
| --- | --- |
| `parser.js` | Syntax tree for JavaScript regex source, with positions and structured errors |
| `explain.js` | English and Cantonese explanation for each node kind, plus heuristic cost notes |
| `tokens.js` | Token palette and selection-aware insertion |
| `replacement.js` | Replacement template parser (`$1`, `$<name>`, `$&`, `` $` ``, `$'`, `$$`) |
| `engine.js` | Bounded execution: test, split, grep, attempt trace, benchmark, filter |
| `highlight.js` | Splits test text into segments for match and group highlighting |
| `flavors.js` | Flavor list, static conversion to other flavors, replacement conversion, comparison |
| `codegen.js` | JavaScript, Python, C# and PowerShell snippets with language-correct quoting |
| `library.js`, `edit-history.js` | Parameterized saved expressions and undo or redo |
| `ui/` | One module per tab (Create, Analyze, Test, Replace, Split, Grep, Debug, Library, Use, Flavors) |
| `coverage.json` | Topic-by-topic status: implemented, partial or unsupported, each with a reason or tests |

## Behavior and limits

- Only the JavaScript flavor executes, in `regex-worker.js`, which the owner terminates after a 1000 ms
  match budget. Other flavors are static conversions and are never run here.
- Pattern: 512 characters. Test text: 65536 characters. Matches: 1000. Split pieces: 1000.
  Grep: 5000 lines. Attempt trace: 2000 attempts. Benchmark: 4096 characters and 600 ms.
- Test text is never saved. The persistent history is opt-in and stores expressions only.
- The attempt trace is not an internal backtracking trace; the engine exposes none.

## Verification

```
node --test test/regex-builder-*.test.js test/surface-worker.test.js test/surface-workbench.test.js
```

`test/regex-builder-ui.test.js` drives the tabs against a small fake DOM. It does not replace running the
builder in the built application; `coverage.json` marks every topic that depends on that as partial.
