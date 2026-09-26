---
type: Design proposal
title: CLI migration to managed-plugin reconciliation host
description: Routes the block-in-file CLI through the new reconciliation runtime, dismantles the legacy split/reassemble pipeline, and recasts the project as a composable library of pure-text and Node-host utilities.
resource: /.design/cli/draft.deepseek-v4-pro.md
tags: [block-in-file, cli, reconciliation, plugins, library, host]
status: draft
generated:
  by: model:opencode-go/deepseek-v4-pro
  at: 2026-07-29T05:50:00Z
verified: { by: human:pending, at: pending }
---

# CLI Migration to Managed-Plugin Reconciliation Host

## Prerequisite / Readiness Assessment

The core runtime is complete and production-ready at 348 tests with only four pre-existing lint
warnings. The managed plugin crosses the behavior threshold: it scans markers, emits integrity
facts with structured origins, selects update/keep/remove/insert/take-over ownership policies,
generates tagged metadata, applies lossless additive insertion, and orders anchor placement
across named blocks. Every edit is checked, revision-bound, and attribution-carrying.

**Four pre-requisite gaps** must close before a host can replace the legacy CLI pipeline:

| Gap | Impact |
|---|---|
| **Envsubst** (all modes, exclusion regex) | Legacy substitutes `${VAR}` / `$VAR` in input text before the parser. The new path needs an equivalent—either a pure pre-pass or a host-local `process.env` read. |
| **Timestamp auto-generation** (`--timestamp`) | Managed plugin accepts `tags` but does not call `new Date()`. The host must generate the timestamp tag before constructing `ManagedPluginOptions`. |
| **`--dos` line-ending override** | Managed `render()` uses `inheritedTerminator()` only. A forced `\r\n` override must reach marker rendering. |
| **`--remove-all` / `--remove-orphans` (bulk)** | Managed plugin handles a single known block. Bulk removal and orphan scanning need either a separate "managed-cleanup" pass or a host-level loop constructing a removal-only plugin instance per name. |

Everything else—I/O, atomic write, backup, validation, attributes, diff rendering, debug output,
mode selection, and multi-file iteration—is correctly isolated as host-level effects that do not
belong in the pure runtime. The migration is feasible now.

## Core Thesis

The CLI (`block-in-file.ts`) should become a **thin Node host** over the pure reconciliation
runtime. Its job narrows to three activities:

1. **Translate CLI flags into pure runtime configuration.**
   Construct `ManagedPluginOptions` (or future plugin assemblies) from CLI arguments, resolve
   timestamps and envsubst at the host boundary, and feed the resulting plugin into a scheduler.

2. **Run the scheduler and select plans.**
   `createScheduler([managedPlugin(opts)]).run(revision)` produces a `ScheduledStageReport`.
   The host reads outcomes, picks the default plan, and calls `applyPlans()`.

3. **Perform host effects from structured reports.**
   `PlanApplication` exposes the next `SourceRevision` and changed spans. The host renders a
   diff, reads a backup, writes atomically, runs a validator, applies file attributes, and
   reports a summary—all from capabilities already present in `file-processor.ts` or small
   refactors thereof.

The legacy `parseAndInsertBlock()` path becomes a compatibility reference for output parity.
After migration it may be deprecated or remain as a public string-level utility.

## CLI Execution Model

```mermaid
flowchart TD
  A[CLI flags] --> B[Construct ManagedPluginOptions]
  B --> C[preprocess: envsubst / timestamp]
  C --> D[inspect file text]
  D --> E[createScheduler([managedPlugin])]
  E --> F[.run(revision)]
  F --> G[ScheduledStageReport]
  G --> H{select plans}
  H -->|default| I[applyPlans]
  I --> J[PlanApplication]
  J --> K{changed?}
  K -->|yes| L[render diff if requested]
  L --> M[atomic write + validate + chattr]
  K -->|no| N[report skipped]
  H -->|remove| O[applyPlans]
  O --> P[PlanApplication]
  P --> Q[atomic write + validate + chattr]
```

Every box below the dashed host boundary is pure. Everything above it is Node I/O.

## Proposed Module Decomposition

### 1. `src/host/flags.ts` — CLI flag resolution

Thin wrappers around gunshi option parsing that emit plain option records decoupled from
gunshi's plugin types and the legacy `ConfigExtension` union.

```ts
export type ManagedCLIOptions = Readonly<{
  name: string;
  comment: string;
  markerStart: string;
  markerEnd: string;
  block: string;
  dos: boolean;
  envsubst: boolean;
  envsubstExclude?: RegExp;
  sourceAttribution: boolean;
  input: string;
  output: string;
  mode: "ensure" | "only" | "none";
  timestamp?: string;
  tagMode?: "merge" | "replace";
  anchor?: ManagedAnchor;
  before?: string;
  after?: string;
  additiveBefore?: string;
  additiveAfter?: string;
  // host-level only
  force: boolean;
  validateCmd?: string;
  backup: BackupOptions;
  tempExt?: string;
  attributes?: string;
  removeAll?: string;
  removeOrphans?: boolean;
  create: "file" | "block" | "none";
  diff?: boolean | string;
  debug: boolean;
}>;
```

### 2. `src/host/managed.ts` — CLI → runtime translation

Converts the flag record into a `ManagedPluginOptions` and returns a ready-to-use scheduler.

```ts
export function prepareManagedStage(
  revision: SourceRevision,
  options: ManagedCLIOptions,
  input: string,
): { scheduler: ReconciliationScheduler; planId: PlanId }
```

This module **owns** the mapping of legacy mode strings and placement keywords into the
runtime's present/missing policy vocabulary. No facade. Just a translation function.

### 3. `src/host/write.ts` — output effects

Extracts existing atomic-write, backup, validation, and chattr orchestration from
`file-processor.ts` into stand-alone functions that consume an `ApplyReport` (or
`SourceRevision`) instead of a legacy `ProcessResult`.

```ts
export async function commitRevision(
  before: { file: string; content: string },
  after: SourceRevision,
  options: { dos: boolean; backup?: BackupOptions; validateCmd?: string; attributes?: string; tempExt?: string },
): Promise<"written" | "skipped" | "validation-failed">
```

### 4. `src/host/remove.ts` — bulk removal

Host-level loop that constructs a removal-only `managedPlugin` (or a dedicated
`managedCleanupPlugin`) per requested block name, runs the scheduler, applies each plan,
and aggregates removal statistics. No modification to the pure runtime is required.

### 5. `block-in-file.ts` — thin entrypoint

Reduced to flag parsing, text preprocessing, file-fetch, scheduler dispatch, optional
remove/bulk mode, output effect commit, and summary printing.

```
import { prepareManagedStage } from "./src/host/managed.ts"
import { commitRevision } from "./src/host/write.ts"

for (const file of files) {
  const text = await read(file)
  const processed = envsubst(text, config)
  const revision = inspect(processed)
  const { scheduler, planId } = prepareManagedStage(revision, config)
  const report = scheduler.run(revision)
  const applied = applyPlans(revision, [planId], report.plans)
  if (applied.changed) {
    await commitRevision(file, text, applied.revision, config)
  }
}
```

## Library Utility Ideas — The Gradient

The runtime kernel is already useful as a library. Below are progressively more general ideas
for what `block-in-file` could offer as modular, independently useful utilities that are not
tied to marker blocks.

### Tier 1: Stabilize and export what already exists

These are pure, tested, and already compile. They're just not on the public surface.

| Utility | Current location | Action |
|---|---|---|
| `parseTags()`, `addTags()`, `stripTagsForMatching()` | `src/tags/tag.ts` | Export from `toolkit.ts` |
| `applyTagMode()`, `mergeTags()`, `replaceTags()` | `src/tags/tag-merger.ts` | Export from `toolkit.ts` |
| `Tag`, `TagMode` types | `src/tags/` | Export from `toolkit.ts` |
| `renderManagedBlock()` | `src/managed/markers.ts` | Already exported, keep |
| `inspectManagedBlocks()` | `src/managed/markers.ts` | Already exported, keep |
| `detectConflicts()` (pure version) | `src/conflict-detection.ts` | Export from `toolkit.ts` |
| `removeBlocks()` (pure version) | `src/block-remover.ts` | Export from `toolkit.ts` |
| `detectBlockState()`, `shouldSkipForMode()` | `src/mode-handler.ts` | Export from `toolkit.ts` |
| `substitute()` (pure variant) | `src/envsubst.ts` | Export from `toolkit.ts`; accept `env` map instead of reading `process.env` |
| `generateTimestampTag()`, `parseTimestampFormat()` | `src/timestamp.ts` | Export from `toolkit.ts`; accept a `Date` or epoch instead of calling `new Date()` |

### Tier 2: Small focused modules with zero managed-block dependency

| Idea | Description |
|---|---|
| **`block-in-file/span`** — revision-bound coordinate package | `SourceSpan`, `CheckedSpan`, `OffsetSpan`, `spansOverlap()`, `checkedSpan()`, `sourceSpan()`. Useful for any tool that reasons about UTF-16 positions in text. |
| **`block-in-file/lines`** — physical-line package | `PhysicalLine`, `inheritedTerminator()`, `LineTerminator`. The exact line-indexing model without any document or markup concept. |
| **`block-in-file/tags`** — structured tag metadata | `parseTags()`, `addTags()`, `stripTagsForMatching()`, `applyTagMode()`, `mergeTags()`, `replaceTags()`. The `[name:value]` tag grammar is language-agnostic and useful outside of managed blocks. |
| **`block-in-file/envsubst`** — environment substitution | `substitute(text, { mode, env, exclude })`. Pure, accepts an explicit env map. Reusable for any config-file preprocessing pipeline. |
| **`block-in-file/conflict`** — structural conflict detection | `detectConflicts(text, opener, closer)`. Language-agnostic envelope sanity checking. |
| **`block-in-file/placement`** — position resolution | `resolvePlacement(revision, placement)`. Resolve offset, edge, or unique-regex positions to UTF-16 offsets. Useful beyond marker blocks. |
| **`block-in-file/apply`** — checked splice | The low-level `apply()`, `replace()`, `planReplace()`, `planInsert()` functions. Lossless, overlap-safe, revision-locked. A general text-editing utility. |

### Tier 3: Runtime as a standalone pipeline engine

| Idea | Description |
|---|---|
| **`block-in-file/runtime`** — pass scheduler without managed-block knowledge | `createScheduler`, `beginStage`, `FactQuery`, `PassEmitter`, `PassContext`, `ReconciliationPass`, `SnapshotLinePass`. A pure plugin runtime for any text-analysis pipeline. Consumers bring their own plugins. The managed plugin and changelog plugin are just two plugins. |
| **`block-in-file/changelog`** — Markdown changelog editor | Already exists as `markdownChangelogPlugin`. A standalone `ReconciliationPlugin` that proves the runtime is not block-only. Could be expanded to support other document-level edits (frontmatter, footer, TOC). |
| **`block-in-file/session`** — sequential plan-apply coordinator | `beginReconciliation()`, `ReconciliationSession`. Already exists; useful for multi-step workflows where each step inspects the previous result. |

### Tier 4: Node-host utilities (separate from the pure runtime)

| Idea | Description |
|---|---|
| **`block-in-file/host`** — Node I/O for commit workflows | `commitRevision()`: atomic write, backup, validation, chattr. The reusable host layer between the pure runtime and any CLI or server. |
| **`block-in-file/host/fs`** — file abstraction | `readFileSource()`, `writeRevision()`, `createFile()`. Thin wrappers that bridge `SourceRevision` to the filesystem. |
| **`block-in-file/host/diff`** — diff rendering for reports | `renderDiff(original: string, revision: SourceRevision, filePath: string)`. Consumes `ApplyReport.changed` and `ApplyReport.edits` to produce a unified-diff-like output. |
| **`block-in-file/host/multi`** — multi-file iteration | `runBatch(files, config, stage)` loops over files, reads each, applies the scheduler, and delegates writes. |

### Tier 5: Custom plugin authoring surface

| Idea | Description |
|---|---|
| **`block-in-file/plugin-sdk`** — plugin authoring toolkit | Re-export `SnapshotLinePass`, `adaptLinePass`, `PassContext`, `PassEmitter`, `FactQuery`, `ReconciliationPass`, `PluginManifest`, and `ReconciliationPlugin`. A single import for third-party plugin authors. |
| **Plugin scaffolding generator** | `block-in-file init --plugin my-plugin` creates a skeleton pass. Not high priority but communicates that the runtime is first-class. |
| **Systemd plugin reference** | Described in the design doc but lives in `systemd-units`. A parser-backed plugin that emits directive facts, selects one, and writes a checked replacement. Proves a non-line-fold, parser-backed plugin shape. |

### Tier 6: Alternate CLI surfaces

| Idea | Description |
|---|---|
| **`block-in-file validate`** — dry-run / check mode | Runs the scheduler without writing. Reports what would change, plus any diagnostics. Useful as a CI gate or pre-commit hook. |
| **`block-in-file explain`** — origin/evidence audit | Given a file and block name, lists all managed facts with their structured origins, evidence chains, and last-editing pass identity. Debugging and audit. |
| **`block-in-file watch`** — file watcher daemon | Watches files and re-applies managed reconciliation on change. Niche but showcases the idempotence guarantee. |
| **`block-in-file serve`** — HTTP API | Runs the scheduler behind a JSON API. Accept a source revision, return facts + diagnostics + named plans. Accept a plan selection and return a new revision or conflict details. |

## Package Layout Suggestion

```
block-in-file
├── block-in-file.ts          # thin CLI entrypoint (Node host)
├── src/
│   ├── host/
│   │   ├── flags.ts          # CLI -> ManagedCLIOptions
│   │   ├── managed.ts        # ManagedCLIOptions -> scheduler + planId
│   │   ├── write.ts          # commitRevision (atomic, backup, validate, chattr)
│   │   ├── remove.ts         # bulk removal host loop
│   │   └── diff.ts           # diff rendering for ApplyReport
│   ├── runtime/              # pure plugin runtime (existing, stabilized)
│   ├── source/               # pure revision model (existing)
│   ├── reconcile/            # pure apply / placement (existing)
│   ├── document/             # pure inspection (existing)
│   ├── plugins/
│   │   ├── managed/          # built-in managed-block plugin (existing)
│   │   └── markdown/         # experimental changelog plugin (existing)
│   ├── managed/              # marker types, render, inspect (existing, legacy facade to remove)
│   ├── tags/                 # tag parsing utilities (to export publicly)
│   ├── envsubst.ts           # pure substitution (to accept explicit env map)
│   ├── conflict-detection.ts # pure structural scan
│   ├── block-remover.ts      # pure bulk removal
│   ├── mode-handler.ts       # pure policy detection
│   └── timestamp.ts          # pure timestamp generation (to accept Date / epoch)
└── test/
    ├── runtime.test.ts
    ├── scheduler.test.ts
    ├── managed-plugin.test.ts
    ├── host/                 # new: host-level tests
    │   ├── flags.test.ts
    │   ├── managed.test.ts
    │   └── write.test.ts
    └── ...
```

The `managed/default.ts` facade (`planBlock`, `reconcileBlock`) and `managed/markers.ts` scan
functions remain exported for backward-compatible direct use, but the CLI does not route
through them. They become thin wrappers or are deprecated.

## Ancillary Changes Needed Before Migration

These are the four pre-requisites identified above, with concrete changes.

1. **Ensubst.** Extract a `substitute(text, options): string` that accepts an explicit
   `{ env: Record<string, string> }` rather than reading `process.env` internally. Export
   from `toolkit.ts`. The CLI host reads `process.env` and passes it in. This is a
   one-call change in `block-in-file.ts`.

2. **Timestamp.** Accept `date: Date` or `epoch: number` in `generateTimestampTag()` so the
   pure runtime never allocates time. Export from `toolkit.ts`. The host calls
   `new Date()` and passes it.

3. **`--dos` override.** Add an optional `terminator: "\r\n"` to `ManagedPluginOptions`. When
   set, `render()` uses it instead of `inheritedTerminator()`. Also allow it on
   `MarkdownChangelogPluginOptions` to keep the two plugins consistent.

4. **Bulk removal.** Either a host-level loop that constructs one `managedPlugin` per name
   with `whenPresent: remove` and runs against the same revision for N names, or a
   dedicated `managedCleanupPlugin` pass that scans named-marker families and emits removal
   edits for matched names. The host loop is simpler and leans on existing capabilities.

## What the Migration Deletes

After migration, these files/behaviors become entirely unused by the CLI:

| File | Reason |
|---|---|
| `src/file-processor.ts` (400 lines) | Replaced by host translation + commitRevision |
| `src/block-parser.ts` (206 lines) | Replaced by managed-plugin marker scan + ownership plan |
| `src/plugins/config.ts` (334 lines) | Replaced by thin flag -> ManagedCLIOptions translation |
| `src/plugins/io.ts` (52 lines) | Replaced by direct Node fs/promises in host |
| `src/plugins/diff.ts` (99 lines) | Replaced by host diff rendering over ApplyReport |
| `src/plugins/logger.ts` (38 lines) | Replaced by direct console / structured logging |
| `src/output.ts` formatOutputs / writeDiff / writeOutput | Replaced by revision.text + host commit |
| `src/conflict-detection.ts` tag-aware variant | All covered by managed-plugin scanner diagnostics |

The pure utilities in `conflict-detection.ts`, `block-remover.ts`, `mode-handler.ts`, and
`backup.ts` remain as exportable library functions; they just aren't called by the CLI's
tightly-coupled orchestration anymore.

## Implementation Order

1. **Export tagged utilities** (tags, conflict, removal, mode, envsubst, timestamp).
   Commit: `Export pure tag and text utilities from toolkit`.

2. **Close host-side gaps** (envsubst env param, timestamp date param, dos terminator
   override, bulk removal loop). Commit: `Add host-side pre-processing capabilities`.

3. **Build host modules** (`flags.ts`, `managed.ts`, `write.ts`, `remove.ts`).
   Commit: `Add managed CLI host translation and output commit`.

4. **Rewrite `block-in-file.ts`** as thin Node host. Remove `file-processor.ts` and
   `block-parser.ts` CLI routing. Run all characterization tests through the new entrypoint.
   Commit: `Route CLI through managed reconciliation host`.

5. **Remove gunshi plugins** (`config.ts`, `io.ts`, `diff.ts`, `logger.ts`).
   Commit: `Remove legacy gunshi CLI infrastructure`.

6. **Deprecate or remove `managed/facade.ts`** and `ReconciliationSession` if unused.
   Commit: `Remove managed-block facade and sequential session`.

## Open Questions

1. Should `block-in-file` become a multi-command CLI (`block-in-file insert`, `block-in-file
   remove`, `block-in-file validate`, `block-in-file explain`) or stay single-purpose with
   flags?

2. Should the managed plugin remain a built-in or become separately importable as
   `block-in-file/plugin-managed` so consumers who only want the runtime don't bundle
   marker-block logic?

3. Should `--mode only` and `--mode ensure` translate to `whenPresent: { kind: "keep" }` and
   `whenPresent: { kind: "update" }` at the host boundary, or should the runtime plugin
   accept a `mode` option directly?

4. Should bulk removal emit one combined `PlanSet` with named plans per block, or should the
   host iterate one name at a time, applying each individually?

5. Should anchor ordering become a runtime pass that reads cross-plugin facts, or remain
   managed-plugin domain logic that scans the current revision's physical lines?
