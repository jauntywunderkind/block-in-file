---
type: Review
title: "Check the build: is the retained-revision/plugin direction the right spine, and what is the generic abstraction?"
description: An independent review of the libraryize -> retained-revisions -> CLI-host sprint. Names what the generic abstraction actually is (a lossless region-preserving rewrite kernel), argues the retained-revision model is over-generalized too early, and proposes the narrowest viable spine plus a concrete second-consumer probe.
resource: /.design/check/review.ds4f.0.md
tags: [block-in-file, review, retained-revisions, generic-abstraction, plugin-runtime, spine, abstraction]
status: draft
generated:
  by: model:opencode-go/deepseek-v4-flash
  at: 2026-07-31T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Retained revisions, facts, and checked rewrite passes
  - id: cli-glm
    resource: /.design/cli/draft.glm-5.2.md
    title: CLI host migration onto the retained-revision runtime
  - id: cli-mini
    resource: /.design/cli/draft.mini-m3.md
    title: Direct-host CLI migration and library decomposition
  - id: cli-gpt
    resource: /.design/cli/draft.gpt-5.6-terra.md
    title: Direct CLI hosting over retained reconciliation
  - id: cli-ds
    resource: /.design/cli/draft.deepseek-v4-pro.md
    title: CLI migration to managed-plugin reconciliation host
  - id: libraryize-terra
    resource: /.design/libraryize/draft.gpt-5.6-terra.md
    title: block-in-file v2 - lossless text reconciliation
  - id: stream-exploration
    resource: /.design/libraryize/generalize.glm-5.2.md
    title: The meta - block-in-file as a composable stream processor over physical lines
  - id: toolkit
    resource: /src/toolkit.ts
    title: Current public reconciliation toolkit
---

# Check The Build: Where Are We, Is This The Right Spine, And What Is The Generic Abstraction?

## What Is Up

You asked for a zoom-out review. You are mid-sprint on a big generalization:

1. `libraryize` wave (draft.gpt-5.6-terra.md) proposed block-in-file v2 as a **lossless text reconciliation library** — managed blocks as one assembly among several.
2. `generalize2.retained-revisions.md` (1100 lines, three addenda) named the spine: **immutable retained source revisions** with revision-bound facts, checked edit intents, named plans, and a **public plugin runtime** with pass scheduling, structured origins, and capability-limited contexts.
3. A large implementation sprint landed: revision-bound records, attributed plans, a plugin scheduler, snapshot line-pass, a managed-block reconciliation plugin (531 lines), anchor ordering, metadata policies, and a markdown changelog plugin — 348 tests passing, ~2100 new runtime/managed lines plus ~1500 legacy lines still present.
4. The `cli/` wave (four drafts) converged on: **rewrite the CLI as a thin direct host over `managedPlugin()` + a `./host` subpath**, and delete the legacy `processFile()` facade, `block-parser.ts`, `conflict-detection.ts`, etc.

You have a gut feeling this is not the right path and are unsure what was built. This review is my independent take.

## Verdict Up Front

- **The core direction (lossless retained-source rewriting) is correct and valuable.** The split-reconstruct legacy parser loop is the thing to kill, and "every edit is a checked range against a retained snapshot" is the right correctness spine. This is a real library, not a toy.
- **The retained-revision *plugin runtime* is over-generalized too early.** The revision-bound facts + origins + passes + scheduler + named plans machinery is a framework in search of a second consumer. The docs themselves admit the plugin ABI was deferred until two consumers prove the shape — then the addendum reversed that and built it anyway.
- **The CLI direction is correct in destination but premature as the next step.** Migrating the CLI is real work with a real payoff (delete the legacy path), but it is *not* the thing that makes the library general. It is house-cleaning on top of an already-built runtime.
- **The generic abstraction you are asking for is not "plugins."** It is: **a pure, lossless, region-preserving text-rewrite kernel over retained source** — with two generic verbs, *query facts from a snapshot* and *apply checked edits against that same snapshot* — plus *one* optional assembly (managed blocks) that makes it ergonomic. That kernel is what systemd, markdown, dotfile managers, nginx, and SSH config all need. The plugin runtime is a delivery mechanism, not the abstraction.

## What Was Actually Built (Honest Inventory)

The last sprint built two things at once, and the second one is the risk.

### 1. The correctness kernel — real, keep

- [`src/source/revision.ts`](/src/source/revision.ts) — opaque `RevisionId`, immutable `SourceRevision`.
- [`src/source/spans.ts`](/src/source/spans.ts) — `CheckedSpan` with `expected` text.
- [`src/reconcile/apply.ts`](/src/reconcile/apply.ts) — the sole splice engine: bounds, stale-text, overlap rejection, right-to-left.
- [`src/reconcile/placement.ts`](/src/reconcile/placement.ts) — offset/edge/match/anchor placement.
- [`src/reconcile/session.ts`](/src/reconcile/session.ts) — fresh inspection after each step.
- [`src/document/inspect.ts`](/src/document/inspect.ts) — retained source + physical-line index.

This is ~600 lines of genuinely good, defensible library code. It gives you the property most text-mutation tools don't have: **untouched source bytes are provably untouched.** That is the moat.

### 2. The plugin runtime — built before it was proven

- [`src/runtime/`](/src/runtime/) — `origin.ts` (opaque FactId/EditId/PlanId, structured `Origin`), `facts.ts`, `plans.ts`, `plugin.ts` (manifests, pass descriptors, `after` references), `scheduler.ts` (topological ordering, cycle detection), `stage.ts` (collector), `line-pass.ts` (snapshot line-fold adapter).
- Two plugins: `managedPlugin` (531 lines) and `markdownChangelogPlugin` (196 lines).

The docs are honest about the sequence:

> "A real public processor framework remains deferred... a public plugin/event framework... Freezes lifecycle and conflict semantics before maintained assemblies have established them. Defer." — retained-revisions design, §Variations

> "The plugin framework is a product requirement. This supersedes the earlier recommendation to defer a public plugin ABI until two maintained consumers converge." — retained-revisions design, Addendum

The addendum reversed the discipline **before the second consumer existed**. The changelog plugin is not a second *external* consumer — it is a second *hand-written* example inside the same repo, written to the same model by the same workflow. It validates that the runtime is coherent, not that it's the right abstraction for someone else's problem.

### 3. Legacy + runtime now coexist

The CLI still runs on `file-processor.ts` → `parseAndInsertBlock()`. The new managed plugin is a parallel reimplementation of the same behavior. 348 tests pass, but they largely characterize the *legacy* path and the *runtime* path separately. Nothing yet proves the runtime can carry the CLI's full behavior matrix (the CLI drafts all flag this as the open "characterization harness" gap).

So: you built a correct kernel, then built a framework on top of it, and you're about to spend a migration to make the CLI use it — while the generic abstraction the framework was supposed to express still isn't validated by a real outside consumer.

## Why The Retained-Revision Spine Is Not The Abstraction

Let me steelman the design: retained revisions + revision-bound facts + checked edit intents + passes is a *correct internal discipline*. It is good engineering. The error is promoting it to the *public spine* and calling it the generalization.

Three reasons:

### A. The "processor with state and deferred edits" shape is the load-bearing question, and it's unresolved

The stream-exploration (generalize.glm-5.2.md) named the real capability gap: **"I want to do something later, based on what I see now."** The retained-revision model answers this with `SnapshotLinePass` + a mandatory `finish()` + a deferred `LineEmitter`. That is a workable answer.

But the whole point of the deferred-emission question is *stateful rules that fire on lines as they pass*. The retained-revision model's answer ("a line fold that emits checked intents into an immutable plan") is a *reimplementation* of the stream-processor idea with extra ceremony. It does not simplify the user's mental model; it adds vocabulary (facts, origins, plans, pass descriptors, `after` references, `invocation`) that a user who just wants "insert Y after the next blank line" must now learn.

The changelog plugin is the test case: to insert an entry under a heading you must author a `SnapshotLinePass` with heading facts, a planner that defers an edit until a sibling heading or blank boundary, and named plan selection. That is a lot of machinery for "append under `## Unreleased`."

### B. The facts model is doing two jobs, and only one is generic

Facts are simultaneously (1) **observations about a revision** — generic, useful, right; and (2) **evidence with structured origins for reports** — audit-trail machinery. The first is the abstraction. The second is a reporting feature that couples every plugin to `Origin`, `invocation`, `rule`, and fact-ID-references-edit-evidence.

The docs say "origin records should be report data and debugging data from the first release, not a later retrofit." But report/debug data does not need to be *part of the mutation protocol*. It can be an optional trace layer on top. Making it structural forces every pass author to think about provenance they don't care about yet.

### C. "Coordinates are revision-bound" is a correctness invariant, not a user abstraction

`RevisionId` prevents stale spans from one revision being applied to another. That's excellent safety. But the way to *sell* it to a consumer is "you can't accidentally apply a stale edit," not "every offset, line, span, fact, and planned edit belongs to exactly one source revision." The invariant should be invisible — enforced by the kernel — not vocabulary the caller must speak.

## The Generic Abstraction, Stated Directly

Here is my answer to your actual question.

> **The generic abstraction is a pure rewrite kernel over retained text where every mutation is a checked edit against a snapshot, plus a small vocabulary of intent: query a snapshot for facts, plan edits, apply them losslessly, and inspect the next snapshot.**

Concretely, the public surface that carries this library broadly is small:

```ts
// 1. inspect a snapshot once
const doc = inspect(text);

// 2. derive facts (markers, sections, directives — caller-chosen mechanism)
const blocks = managedBlocks(doc);

// 3. plan checked edits against THAT snapshot
const plan = planBlock(doc, { name, content, whenPresent, whenMissing });

// 4. apply losslessly, get next snapshot
const result = apply(text, plan);
const next = inspect(result.text);
```

Everything else — facts-as-framework, passes, schedulers, origins, manifests, named plans — is an *assembly* that can be layered on later, consumer by consumer. The kernel is the library. The assemblies are conveniences. The plugin runtime is a possible future, not the current product.

This is *not* "remake block-in-files." It is the thing that makes `systemd-units`, a markdown editor, a dotfile manager, nginx config management, and SSH config management all share one codebase: **the lossless, checked, snapshot-based rewrite core.** Each consumer brings its own parser for facts (systemd's `UnitDocument`, a markdown heading walker, a shell-parser) and consumes the same kernel.

The current `toolkit.ts` export surface is honestly close to this — `inspect`, `walk`, `planBlock`, `apply`, `resolvePlacement`, `beginReconciliation` are the right generic verbs. The problem is not that these are missing; it's that the runtime/pass/origin machinery has been promoted to first-class status *before* a second consumer proved it, so the library's public face is a framework rather than a kernel.

## Is The CLI Direction Right?

**Yes, in destination. It is the right long-term shape: CLI = thin host; library = pure kernel; host effects (fs, validate, backup, attributes, envsubst) = Node-only.** This matches how the good text libraries work. But two caveats:

1. **It is not the priority right now.** Migrating the CLI deletes legacy code and proves the runtime against the full behavior matrix. That proof is *valuable* — but it's the third step, not the second. The second step is proving the kernel's generic abstraction with a genuinely different external consumer. If you migrate the CLI first, you spend a week on house-cleaning that tells you nothing about whether the retained-revision model serves a non-block, non-hand-written consumer.

2. **The four CLI drafts all say the same thing.** Direct host, managed plugin, `./host` helpers, characterization harness, delete the legacy path. There is consensus. The design question for the CLI is *settled*. What remains is execution. Spending more design cycles on the CLI direction is sunk-cost behavior.

The one genuinely useful *CLI* deliverable that also advances the library: the **characterization harness** (running the full CLI test matrix through the new host). That is not just cleanup — it's the first real proof the managed plugin can carry the actual product. Do that as part of step 2/3, not as a separate framework-shaped milestone.

## What I Would Do Now

Concrete, in order:

### 1. Adopt the kernel-abstraction as the public story

Make `src/toolkit.ts` the canonical product, and describe it as a **lossless text-rewrite kernel**, not a "reconciliation plugin runtime." The README should lead with "inspect a snapshot, plan checked edits, apply losslessly, inspect again." Managed blocks are one built-in assembly that makes it ergonomic.

### 2. Prove the kernel with a genuinely external second consumer — the systemd adapter

This is the single highest-value next step, and it is *why* the systemd-units relationship exists. Write the systemd adapter *against the kernel surface only* — `inspect` + `UnitDocument` facts + `planBlock`/raw plan + `apply` — **without** using `createScheduler`, `ReconciliationPlugin`, origins, or named plans. See how far the kernel gets you.

Then ask: did I need the plugin runtime to write this? If the answer is "no" (I believe it's "no" — the adapter is ~50 lines per the existing docs), then the plugin runtime is a framework built ahead of evidence, and you should **demote it to an experimental/`runtime` subpath, not export it from the root toolkit**. If the answer is "yes," you've found the exact missing piece — and you'll know precisely what to promote, not a guessed shape.

### 3. Migrate the CLI through the characterization harness

Keep the direct-host destination. Route the CLI through `managedPlugin()` + host helpers, run the full CLI matrix as the migration gate, then delete `file-processor.ts`, `block-parser.ts`, `conflict-detection.ts`, `mode-handler.ts`, `block-remover.ts`, `output.ts`, `managed/default.ts`, `managed/markers.ts`. This is real work with a clear finish line, and it's the *third* step, after the kernel story and the external consumer proof.

### 4. Keep `SnapshotLinePass` but as a convenience adapter, not a promotion gate

The line-fold with deferred EOF emission is a genuinely useful assembly tool for markdown-style consumers. Keep it. Do not make it the model every consumer must express themselves through.

### 5. Do NOT ship the plugin runtime as the public spine yet

Defer the public plugin ABI until either (a) the systemd adapter proves a piece of it is needed, or (b) a second *external* consumer — not the changelog plugin, not a hand-written markdown example — needs it. The docs' original promotion gate was right. The addendum reversed it too early.

## What To Stop Doing

- **Do not spend more design cycles on the CLI wave.** It's settled; execute.
- **Do not build more assemblies to validate the runtime.** A third hand-written plugin would still be a self-consumer. External validation only comes from systemd-units or another real project.
- **Do not let provenance machinery leak into the mutation protocol** until a consumer asks for explainability as a product feature.
- **Do not delete the legacy path before the characterization harness proves the managed plugin is byte-compatible** across the full flag matrix (especially `--remove-all`, `--remove-orphans`, `--dos`, `--append-newline`, `--envsubst`).

## Bottom Line

You did not build the wrong thing. You built a genuinely good correctness kernel and then over-wrapped it with a framework before the framework's shape was proven. The generic abstraction is the **lossless retained-source rewrite kernel**: inspect → fact → checked plan → lossless apply → inspect. That kernel is what carries the library broadly. Managed blocks are an assembly. The plugin runtime is a deferred framework.

The proof path: write the systemd adapter against the *kernel only*, demote the runtime to experimental if it isn't needed, migrate the CLI through a characterization harness, and only then reconsider the plugin ABI — against real external consumers.
