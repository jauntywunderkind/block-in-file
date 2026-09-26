---
type: Design draft
title: Direct-host CLI migration and library decomposition
description: Replace the legacy orchestration facade with a thin, direct host that composes managedPlugin() over retained source revisions, while carving out reusable modules for third-party plugin authors.
resource: /.design/cli/draft.mini-m3.md
tags: [block-in-file, cli, host, library, plugin, retained-revisions]
status: draft
generated:
  by: model:openai/minimax-m3
  at: 2026-07-29T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Retained revisions, facts, and checked rewrite passes
  - id: managed-plugin
    resource: /src/plugins/managed/default.ts
    title: managed block reconciliation plugin
  - id: legacy-orchestration
    resource: /src/file-processor.ts
    title: Legacy CLI orchestration
  - id: libraryize-exploration
    resource: /.design/libraryize/generalize.glm-5.2.md
    title: Library decomposition exploration
---

# Direct-Host CLI Migration and Library Decomposition

## Decision

Keep `block-in-file` as a host that **directly composes** the existing pure
runtime and managed plugin. No new wrapper, no `ensureBlock()` API, no
re-exported `ProcessContext` mega-object. The host is a small program that
loops over files and stitches together library functions that should also be
useful to anyone writing their own host or plugin.

This continues the existing design at `/.design/generalize2.retained-revisions.md`
and is consistent with `/.design/libraryize/generalize.glm-5.2.md`. The
implementation gaps identified in that document are now narrow: a single new
pass for `--remove-all` plus re-homing a small set of pure helpers under a
`./host` subpath.

## What Is Already Done

The migration plan from the previous design has produced these slices, all
committed:

- `Add revision-bound reconciliation records` ([commit](/src/source/revision.ts))
- `Add attributed reconciliation plans` ([commit](/src/runtime/origin.ts))
- `Add reconciliation plugin scheduler` ([commit](/src/runtime/scheduler.ts))
- `Add snapshot line pass and changelog plugin` ([commit](/src/runtime/line-pass.ts))
- `Add managed block reconciliation plugin` ([commit](/src/plugins/managed/default.ts))
- `Add managed block metadata policies` ([commit](/src/plugins/managed/default.ts))
- `Add lossless managed additive updates` ([commit](/src/plugins/managed/default.ts))
- `Add managed anchor ordering` ([commit](/src/plugins/managed/anchors.ts))

The pure public toolkit at `src/toolkit.ts` exports the entire retained-source
kernel, document inspection, the reconciliation runtime, the plugin scheduler,
the line-fold adapter, and both the markdown and managed plugin assemblies. 348
tests pass on Linux with the current snapshot.

## What Is Left Before the CLI Can Move

The audit at `/.design/libraryize/generalize.glm-5.2.md:103-117` (and a fresh
review) names the remaining features still living on the legacy path:

1. `removeAll` and `removeOrphans` are not yet expressed as a plugin pass.
2. `--dos` is a whole-document lossy transform that has no host home.
3. `--append-newline` is entangled with the parser, not a host transform.
4. The atomic-write temp+rename flow is duplicated in `processFile`.
5. The diff renderer is duplicated across `src/output.ts` and
   `src/plugins/diff.ts`.
6. The output target semantics (`-` / `--` / `---` / path) live in three
   places.
7. Backup, validation, attributes, and envsubst are not exposed from a
   `./host` subpath.
8. The mode policy (`ensure` / `only` / `none`) needs to be expressed as one
   host branch on the `managed.outcome` fact.

Items 1 through 3 require new code. Items 4 through 8 are re-homing moves
already characterized by existing tests.

## New Runtime Pass: `managedCleanupPlugin`

`--remove-all name1 name2 ...` and `--remove-orphans` are the only remaining
runtime gap. The plugin will mirror `inspectManagedAnchors`:
its scanner recognizes any complete managed marker family, the planner emits
a `replace(envelope, "", "remove managed block")` for each requested name (or
each block whose payload would be empty), and the resulting facts replace
`src/block-remover.ts`.

```ts
type CleanupRequest = Readonly<{
  blockNames?: readonly string[];   // from --remove-all
  removeOrphans?: boolean;           // from --remove-orphans
}>;
```

A single stage run with one selected plan can remove many blocks in one
checked splice. The `managed.integrity` fact and the existing diagnostics
(`nested-marker`, `orphan-opener`, `duplicate-block`) already cover every
removal case the legacy `removeBlocks()` and `block-remover.ts` exercise.
Nothing new is needed in the runtime.

## New Host Subpath: `./host`

A `host` subpath gives the new CLI (and any third-party embedder) a small
surface of pure, file-aware helpers. Each helper is independently testable and
takes only the arguments it needs:

```text
src/host/
  envsubst.ts       substitute(text, { mode, exclude })        pure
  attributes.ts     parseAttributes(text), applyAttributesSafe(file, changes, opts)
  validation.ts     runValidation(file, cmd)                  pure command runner
  backup.ts         performBackup(file, options, content?)    already pure
  diff.ts           generateDiff(original, modified, path)     pure
  transforms.ts     withDosLineEndings(text)
                   withTrailingBlankLine(text, at: "eof")
  atomic-write.ts   writeAtomic(file, text, { tempExt, validateCmd, force, io })
  write-target.ts   writeText(target, text)                    dispatches -/--/---/path
  build-request.ts  buildManagedOptions(flags, env, inputText) -> ManagedPluginOptions
                   computes tags, sourceLine, sourceLinePrefix, additive policy
  compose.ts        runManagedFile(args, deps)                 one per-file host loop
```

`buildManagedOptions` is the only one that takes CLI-flag-shaped data; the
others take either content or paths. Each helper has its own test file and
characterizes one of the existing CLI tests.

`src/host.ts` is the new entry point and re-exports them. `package.json`
gains:

```json
"./host": {
  "types": "./dist/host.d.mts",
  "import": "./dist/host.mjs"
}
```

The CLI becomes a top-level loop that calls `runManagedFile(file, env)` per
file, with no `ProcessContext` object surviving past the function boundary.

## New CLI Shape

The new `block-in-file.ts` is small enough to read end to end:

```ts
#!/usr/bin/env -S npx tsx
import { cli, define } from "gunshi";
import config from "./src/plugins/config.ts";
import logger from "./src/plugins/logger.ts";
import io from "./src/plugins/io.ts";
import { buildManagedOptions } from "./src/host/build-request.ts";
import { runManagedFile } from "./src/host/compose.ts";

const command = define({
  name: "insert",
  run: async (ctx) => {
    const files = ctx.positionals as string[];
    const cfg = ctx.extensions["blockinfile:config"];

    for (const file of files) {
      const result = await runManagedFile({
        file,
        options: buildManagedOptions(cfg, { env: process.env, input: cfg.input }),
      });
      // summary logging is the only loop body
    }
  },
});

cli(process.argv.slice(2), command, {
  name: "block-in-file",
  plugins: [logger(), config(), io()],
});
```

`runManagedFile` is the new home for the per-file sequence: read, envsubst,
inspect, schedule, integrity, apply, mode policy, transforms, backup,
write. The function takes one option object and returns one small result.
There is no internal `ProcessContext` to grow into another facade.

## What Becomes of the Legacy Modules

After the new host and plugin land, these modules are deletion candidates:

- `src/file-processor.ts` — the orchestration facade
- `src/block-parser.ts` — legacy `parseAndInsertBlock`
- `src/conflict-detection.ts` — superseded by managed-plugin diagnostics
- `src/mode-handler.ts` — three lines, becomes a one-line branch in the host
- `src/block-remover.ts` — replaced by `managedCleanupPlugin`
- `src/output.ts` — lossy `formatOutputs` and duplicate `generateDiff`
- `src/managed/default.ts` and `src/managed/markers.ts` — non-runtime
  duplicates; the runtime plugin re-implements them losslessly

The existing characterization tests at `test/{block-in-file,cli,mode,additive-cli,anchor,source-attribution,timestamp-integration,attributes-integration,envsubst-integration}.test.ts`
become the migration acceptance gate. Each existing CLI test must pass
against the new host before the corresponding legacy module is deleted.

## How This Forms a Library of Reusable Utilities

The host decomposition is structured so every helper is independently useful:

- A third-party **plugin author** imports the runtime and the managed
  primitives from `block-in-file/toolkit` and writes their own scan/plan.
  The marker-dialect helpers, tag identity, and `inspectManagedAnchors` are
  already part of the toolkit exports.
- A third-party **host author** (their own CLI, their own daemon) imports
  `buildManagedOptions` and the per-file composable helpers from
  `block-in-file/host`. They do not need the legacy `ProcessContext`, the
  gunshi command shape, or any of the duplicated diff or envsubst code.
- A third-party **user of managed blocks** in a different file format
  (systemd, nginx, ssh) imports `managedPlugin()` and the runtime directly.
  Their host is a few lines long: read, schedule, select plan, write.

The split is not theoretical. Each new file under `src/host/` has at least
one test that exercises it from a thin driver without any CLI. The toolkit
re-exports already expose the marker-dialect primitives, tag identity, and
placement resolvers, so a plugin author never needs to read `src/managed/`.

## Alternative Approaches Considered

The `/.design/generalize2.retained-revisions.md` addendum proposed an
`ensureBlock()` compatibility facade. I reject it:

- A facade would make `block-in-file/host` a one-call entry point that hides
  the composition. That is precisely the "blocks with more options"
  framing the original decision rejected.
- A facade couples new host code to legacy option names and to the gunshi
  `ConfigExtension` shape. The runtime would be reachable only through an
  import that re-encodes CLI flags.
- A facade blocks the library decomposition: tag identity, marker dialect,
  and `AdditivePolicy` would be reachable only through the facade's argument
  list, not as standalone values.

A more conservative alternative is to leave `block-in-file.ts` wired to
`processFile` and ship a parallel `host` subpath for embedders. That
preserves behavior and reduces review surface. The host path would then be
optional, and `processFile` would only be removed once embedders migrate. I
recommend this in addition to (not instead of) the direct-host migration:
the `block-in-file.ts` becomes a one-screen `runManagedFile` loop, and the
legacy facade is deleted only after the host and its tests cover every CLI
flag.

A more aggressive alternative is to ship the `host` subpath first, leave the
legacy CLI on the facade for one release, and only rewrite `block-in-file.ts`
once the host is stable. The risk is that the facade accretes more flags
while the new helpers stabilize. I prefer the direct rewrite: the host is
the migration target, and the characterization tests already cover every CLI
case.

A still more aggressive alternative is to drop the CLI entirely and ship
only the library. The CLI is currently the only consumer of every legacy
helper, and a library-only distribution would let the runtime and host
modules mature independently. I do not recommend this: the CLI is the
existence proof of the library, and `--remove-all` plus the rest of the
host are the missing seams. Without them, the library has no user.

## How a Library-Only Consumer Would Use It

A third-party author writing their own host follows this recipe:

1. `import { inspect, createScheduler, managedPlugin, applyPlans } from
   "block-in-file/toolkit"`.
2. Read the source file as a string.
3. `const revision = inspect(text)`.
4. `const scheduler = createScheduler([managedPlugin({
     block: { dialect: { opener, closer }, content: payload },
     whenPresent: { kind: "update" },
     whenMissing: { kind: "insert", placement: { kind: "edge", edge: "BOF" } },
     tags, tagMode, sourceLine, sourceLinePrefix, anchor, additive,
   })])`.
5. `const report = scheduler.run(revision)`.
6. Walk `report.diagnostics`; refuse if integrity is invalid.
7. `const applied = applyPlans(revision, [planId], report.plans)`.
8. Write `applied.revision.text` to the destination.

Eight lines per file, no CLI, no gunshi, no legacy `ProcessContext`. The
host helpers from `block-in-file/host` are used only when the consumer
wants envsubst, backup, atomic write, attributes, or diff rendering; the
core loop is toolkit-only.

## Support Section: One Major Block at a Time

This section lists the major features still on the legacy path and the
smallest slice that closes each. Each slice is one commit with its own
characterization tests and the legacy module deleted in the same commit
once the new code is in place.

### 1. Add `managedCleanupPlugin` (commit boundary)

- Add `src/plugins/managed/cleanup.ts` with `managedCleanupPlugin(options)`.
- Mirror the structure of `src/plugins/managed/default.ts:408-531`.
- Reuse `inspectManagedAnchors` shape to find every complete managed marker
  family.
- Emit one `managed.outcome` fact with value `"removed"`.
- Add `test/managed-cleanup.test.ts` covering single-name, multi-name,
  mixed-orphans, and unclosed-block warning.
- Add a `host/build-request.ts` mapping for `--remove-all` and
  `--remove-orphans`.
- Migration gate: existing `test/block-remover.test.ts` passes via the new
  host. Delete `src/block-remover.ts` and the test.

### 2. Add `host/transforms.ts` (commit boundary)

- `withDosLineEndings(text: string): string` and
  `withTrailingBlankLine(text: string, at: "eof" | number): string`.
- Re-export from `src/host.ts`.
- Add `test/host-transforms.test.ts` with CRLF, lone-CR, mixed-ending,
  Unicode, and no-final-newline fixtures.
- Wire the helpers into `runManagedFile` and the new CLI loop.
- Migration gate: existing `test/block-in-file.test.ts` cases for `--dos`
  and `--append-newline` pass via the new host. Delete
  `src/output.ts:3-8` and the parser entanglement in
  `src/block-parser.ts:79-201`.

### 3. Add `host/atomic-write.ts` (commit boundary)

- One function: `writeAtomic(file, text, { tempExt, tempExtPrevalidate,
  validateCmd, force, io })`.
- Branch the temp extension as the legacy code does, but in one place.
- Re-export from `src/host.ts`.
- Add `test/host-atomic-write.test.ts` for the three extensions and the
  validate-before-rename path.
- Migration gate: existing `test/cli.test.ts:96-254` cases for atomic
  writes pass via the new host.

### 4. Consolidate diff rendering (commit boundary)

- Pick the algorithm at `src/plugins/diff.ts:17-81` and move the pure
  `generateDiff` into `src/host/diff.ts`.
- `writeDiff` becomes a one-call host helper that takes an `io` capability
  and a target string. The gunshi extension collapses to a thin re-export.
- Add `test/host-diff.test.ts`.
- Migration gate: existing `test/cli.test.ts:135-148` cases for `--diff`
  pass via the new host. Delete `src/output.ts:26-107`.

### 5. Add `host/write-target.ts` (commit boundary)

- One function: `writeText(target, text, deps)` that dispatches `-` / `--`
  / `---` / path semantics.
- Add `test/host-write-target.test.ts`.
- Migration gate: existing `test/output.test.ts` and `test/cli.test.ts`
  cases for output modes pass via the new host.

### 6. Move backup, validation, attributes, envsubst under `host` (commit boundary)

- Move `src/backup.ts` to `src/host/backup.ts`. Existing tests follow.
- Move `src/validation.ts` to `src/host/validation.ts`. Add
  `test/host-validation.test.ts`.
- Move `src/attributes.ts` to `src/host/attributes.ts`. Existing tests
  follow.
- Move `src/envsubst.ts` to `src/host/envsubst.ts`. Existing tests follow.
- Re-export all four from `src/host.ts`.

### 7. Add `host/build-request.ts` (commit boundary)

- One function: `buildManagedOptions(flags, env, inputText) ->
  ManagedPluginOptions` that maps the gunshi `ConfigExtension` shape to the
  managed plugin's option shape.
- It computes `tags` (from `--timestamp`), `tagMode`, `sourceLine`,
  `sourceLinePrefix`, `anchor`, `additive`, and the input block content
  (with optional envsubst).
- Add `test/host-build-request.test.ts` covering each flag combination.
- The CLI command shrinks to the eight-line loop in this design's "New CLI
  Shape" section.

### 8. Add `host/compose.ts` `runManagedFile` (commit boundary)

- One function: `runManagedFile({ file, options, deps })` that executes
  the per-file sequence: read, envsubst, inspect, schedule, integrity,
  apply, mode policy, transforms, backup, write.
- Returns a small `RunResult` with status, original text, and applied text.
- Re-export from `src/host.ts`.

### 9. Rewrite `block-in-file.ts` (commit boundary)

- Replace the 169-line `block-in-file.ts` with the eight-line loop.
- Run every CLI characterization test.
- Delete `src/file-processor.ts`, `src/block-parser.ts`,
  `src/conflict-detection.ts`, `src/mode-handler.ts`,
  `src/block-remover.ts`, `src/output.ts`, `src/managed/default.ts`,
  `src/managed/markers.ts`, and `src/types.ts`.

### 10. Trim `src/index.ts` (commit boundary)

- Keep only the toolkit re-export.
- Add a `./host` subpath export.
- Delete lines `3, 4, 5, 7, 8, 9, 10` of `src/index.ts`.

## Risk and Order of Operations

The order is chosen so that each commit is independently green:

1. `managedCleanupPlugin` is the only feature without any pure-runtime
   coverage. It must land before the host rewrite, because `--remove-all`
   is the only CLI flag that currently requires the legacy path.
2. `host/transforms.ts` and `host/atomic-write.ts` are the next two
   commits, because they replace the most duplicated code.
3. The diff and write-target helpers are the only commits that touch
   behavior in a public test other than `cli.test.ts`; running them
   before the CLI rewrite lets us keep the legacy CLI green while we
   shape the new one.
4. The four module moves (backup, validation, attributes, envsubst) are
   mechanical and can land as a single commit.
5. `buildManagedOptions` and `runManagedFile` are the two host functions
   that the new CLI loop uses. They land together.
6. The CLI rewrite is the last commit; everything it needs is already
   in `block-in-file/host`.
7. The legacy deletion commits follow after the CLI rewrite is green.

This order respects the core invariant: a fact or edit with an origin from
revision N never silently affects revision N+1. The new host does not
introduce a second source of mutations; the splice engine remains the
single point of change.

## What This Is Not

- It is not a backwards-compatibility facade. Existing `--before` regex,
  `--after` regex, `--create file|block|true|false`, `--dos`, and
  `--append-newline` keep their current CLI surface, but the legacy
  `ProcessContext`, `parseAndInsertBlock`, `removeBlocks`, and
  `formatOutputs` go away.
- It is not a public plugin API expansion. The `block-in-file/toolkit`
  surface is unchanged. The `./host` subpath is a new public surface
  aimed at embedders.
- It is not a rewrite of `block-in-file` for a new language. The Node host
  remains.

## Bottom Line

The CLI migration is a direct-host composition of the existing pure
runtime. One new managed pass, one new `./host` subpath with a small set of
independent helpers, and one eight-line CLI command replace the 169-line
`block-in-file.ts` and the entire legacy `processFile` facade. The library
is decomposed so a third-party host author uses `block-in-file/host` and a
third-party plugin author uses `block-in-file/toolkit`, with no shared
facade between them.
