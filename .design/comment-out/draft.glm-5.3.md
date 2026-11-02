---
type: Feature design
title: Commented-out managed blocks and their state model
description: Record and operate on a commented emission state for managed blocks, with terminal comment-out/uncomment flips, state-persisting updates, and an uncommenting read.
resource: /.design/comment-out/draft.glm-5.3.md
tags: [block-in-file, comment-out, state, markers, tags]
status: draft
generated:
  by: model:zai-coding-plan/glm-5.3#max
  at: 2026-11-02T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: design-session
    resource: opencode://ses_e65c04a58ffeb0QHFGqLoCNBkY
    title: Human-commissioned design session settling the state model, flag names, scope, and read behavior
  - id: block-parser
    resource: /src/block-parser.ts
    title: Ensure-path parser whose body emission must respect commented state
  - id: block-remover
    resource: /src/block-remover.ts
    title: Precedent for terminal in-place block operations and their stats/write dance
  - id: block-reader
    resource: /src/block-reader.ts
    title: Byte-exact read path and provenance exclusion precedent
  - id: tags
    resource: /src/tags/tag.ts
    title: Tag machinery that records structural state without affecting matching
---

# Commented-Out Managed Blocks

## Situation

Managed blocks insert content verbatim. There is no way to make a block's body
inert — commented out — while keeping the block addressable, nor to re-enable
it later. Users disable configuration lines (apt sources, shell exports,
cron-ish stanzas) by hand today, which fights the manager on the next run.

Prior discussion (design session, above source) settled the model. This
document records it.

## Existing addressing (inventory)

- Blocks are addressed **by name only**: opener `<comment> <name> start`,
  closer `<comment> <name> end`. Matching is per-line: trim, strip `[tag]`
  suffixes, string equality. All occurrences of the name match.
- Terminal operations extend addressing without inserting: `--remove <name>`
  (repeatable), `--remove-all "a b c"`, `--remove-match <regex>` (against
  names), `--remove-orphans`, and `--read` (named block, exit 1 when absent).
- `--comment` (default `#`) shapes **markers and the provenance line only**.
  Body content is never transformed today.

## Decisions

1. **State tag + flips** (chosen over terminal-only and pure-declarative
   models): the `[commented]` marker tag is the source of truth.
   Terminal operations flip it; ensure-path updates respect it (a commented
   block stays commented across re-runs, like timestamps under tag-mode
   merge). A `--commented` modifier installs or forces commented emission.
   Storage spelling settled in review: valueless `[commented]` — presence
   is the state, values are ignored, and the tool owns the `commented` tag
   name outright. Rejected: `[state:commented]` (a generic `state` namespace
   could mean anything) and `[commented:true]` (a boolean value adds nothing
   over presence). Other machine tags are only `timestamp` and
   `anchor-{bof,eof}`.
2. **Flag names**: `--comment-out` / `--uncomment` for the terminal flips;
   `--commented` for the emission modifier; `--read-uncommented` for the
   effective-content read. `--read` stays byte-exact verbatim.
3. **Base scope**: flips address the named block (`--name`) only. Family
   variants (`--comment-out-match`, `--uncomment-match`,
   `--comment-out-all`, `--uncomment-all`) are staged as follow-up tickets
   under the same epic.
4. **Read behavior**: `--read` verbatim (commented body reads commented; the
   drift-check `diff` against an uncommented source failing while disabled is
   correct signal). `--read-uncommented` strips one comment layer per body
   line that carries it.

## Semantics

### Commented state

A block is *commented* when its opener carries `[commented]`. Tags are
already stripped for matching, so commented blocks remain addressable and
updatable. The state tag is **structural**: exempt from `--tag-mode replace`
(it is managed exclusively by the comment-state logic, never dropped or kept
as a side effect of tag merging).

Marker lines themselves are never commented further — they already begin with
the comment prefix; commenting them would orphan the block.

### Terminal flips

`--comment-out` and `--uncomment` are terminal operations in the `--remove`
family: they never read block input (no stdin hang), never insert, transform
existing blocks in place, and honor `--diff`, `--backup`, validation, and the
output modes through the same write path as removal.

- `--comment-out`: for every occurrence of the named block, comment each body
  line (see line transform) and add `[commented]` to the opener.
  Idempotent: a block already commented is reported and left untouched.
- `--uncomment`: strip one comment layer from each body line that carries the
  prefix and remove the `[commented]` tag. A block without the state
  tag is already active: reported, untouched. State-gating is what makes
  hand-written comments (`# note` that was never ours) safe from stripping.
- No occurrence of the named block: error to stderr, exit 1 (mirrors
  `--read`).
- Unclosed block: transform to end of file, warn (mirrors the remover).
- Provenance (`# source:`) lines are structural: never prefixed, never
  stripped.
- Combining both flips, or a flip with `--commented`, errors. Placement flags
  (`--before`, `--after`, `--anchor`, `--adopt`) are irrelevant and ignored,
  as with removal.

### Emission persistence on the ensure path

When `processFile` re-renders a block from input:

- recorded state = `[commented]` parsed from the existing opener;
- emission state = `--commented` flag OR recorded state (absent flag keeps
  the recorded state; a fresh block without the flag is active);
- when emitting commented, the **input lines** are commented before they
  reach the parser, so every insertion path (plain, adopt, anchored, EOF)
  emits commented bodies without parser changes;
- `blockWouldChange` receives the emission-form input, so an unchanged
  commented block under its unchanged recipe is a correct ensure-skip;
- the state tag is appended to the emitted opener when emitting commented and
  removed when emitting active, independent of `--tag-mode`.

A recipe therefore does not change while its block is disabled: re-runs keep
the body current *and* commented. An operator (or a second recipe line)
flips state explicitly.

### Reads

- `--read`: byte-exact verbatim body, unchanged contract.
- `--read-uncommented`: implies read mode; each body line carrying the
  comment prefix after its indentation loses exactly one prefix (+ at most one
  space). Not state-gated — it is a per-line textual view ("strip any
  comments"), which for a commented block reconstructs the effective content.

## Line transform

With `prefix = comment.trimEnd()` (reusing `--comment`, so `//`, `;;`, `--`
work) and one space:

| body line | `--comment-out` | then `--uncomment` |
| --- | --- | --- |
| `foo` | `# foo` | `foo` |
| `  foo` (indent) | `  # foo` | `  foo` |
| `# note` (a real comment) | `# # note` | `# note` |
| `#bare` | `# #bare` | `#bare` |
| `` (blank) | `` (untouched) | `` |
| `   ` (whitespace-only) | `   ` (untouched) | `   ` |

- Commenting inserts `prefix + " "` before the first non-whitespace
  character, preserving indentation so indented dialects (yaml, python
  snippets) stay inside their nesting.
- Stripping removes exactly one `prefix` plus at most one following space,
  anchored after the indentation. Layers round-trip one per operation.
- Ambiguity is fundamental and accepted: a hand-added bare `# x` line inside
  a commented block is indistinguishable from a commented `x`; stripping will
  treat it as a commented line. Documented; the recipe re-run is the
  recovery path.

## Interactions

- `--additive` + commented emission (flag or recorded state): **error**.
  Additive compares input lines against file body lines verbatim; with a
  commented body every line would read as missing. Supporting it means
  strip-compare plus re-commenting of merged lines — deferred, not silently
  wrong.
- `--envsubst`: substitution happens on input before commenting; order is
  envsubst → comment emission.
- `--timestamp` / anchors: tags coexist on the opener; state is appended
  after merged tags.
- `--blank-lines never`/`separators`: blank-input filtering and commenting
  are independent (commenting skips blanks; filtering drops them) — either
  order yields the same output.
- `--dos`, backups, `--diff`, validation, attributes: inherited from the
  shared write path.
- v2 runtime (`src/plugins/managed`): the same feature belongs there as an
  emission policy on `BlockRequest` when the CLI host migration
  (`.design/cli/`) lands; not a blocker for the legacy-path CLI work.

## Implementation map

- `src/block-commenter.ts` (new): `commentBodyLine`, `stripCommentLayer`,
  `flipBlocks` (scan like the reader: opener/closer equality with
  tag-stripped matching; stats `{ flipped, alreadyInState, linesChanged }`).
- `src/plugins/config.ts`: boolean globals `comment-out`, `uncomment`,
  `commented`, `read-uncommented`.
- `block-in-file.ts`: extend the terminal-op gate so flips never read stdin;
  flip summary line; read path gains the `--read-uncommented` strip.
- `src/file-processor.ts`: flip branch (before removal; shared write helper
  extracted from the removal/insert dance); emission-state resolution and
  input commenting on the ensure path; state-tag management around
  `applyTagMode`; additive guard.
- `ProcessResult.status` gains `"flipped"` with `flipStats`.
- Tests: `test/block-commenter.test.ts`, `test/comment-out-cli.test.ts`
  (round-trips, idempotence, persistence, ensure-skip, read variants,
  additive error, unclosed block, exit codes).
- README: usage rows, an examples row, and a short "Commented-out blocks"
  section carrying the state model.

## Staged work (epic `bif-commented-out`)

- `bif-comment-out` — base: flips, state tag, emission persistence,
  `--commented`.
- `bif-read-uncommented` — effective-content read (implemented alongside the
  base in the same session; tracked separately per request).
- `bif-commented-out-match` — `--comment-out-match` / `--uncomment-match`
  regex family (depends on base).
- `bif-commented-out-all` — `--comment-out-all` / `--uncomment-all`
  multi-name family (depends on base).
