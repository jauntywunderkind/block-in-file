---
type: Design review
title: block-in-file — check, the retained-revision runtime and CLI direction
resource: /.design/check/review.md
tags: [block-in-file, cli, review, abstraction, plugins, runtime]
status: review
priority: high
generated:
  by: model:opencode/kimi-k2.7-code
  at: 2026-07-31T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Retained revisions, facts, and checked rewrite passes
  - id: cli-draft-gpt
    resource: /.design/cli/draft.gpt-5.6-terra.md
    title: Direct CLI hosting over retained reconciliation
  - id: cli-draft-glm
    resource: /.design/cli/draft.glm-5.2.md
    title: CLI host migration onto the retained-revision runtime
  - id: cli-draft-deepseek
    resource: /.design/cli/draft.deepseek-v4-pro.md
    title: CLI migration to managed-plugin reconciliation host
  - id: cli-draft-mini
    resource: /.design/cli/draft.mini-m3.md
    title: Direct-host CLI migration and library decomposition
  - id: current-toolkit
    resource: /src/toolkit.ts
    title: Current public reconciliation toolkit
  - id: current-cli
    resource: /block-in-file.ts
    title: Current CLI entry point
  - id: managed-plugin
    resource: /src/plugins/managed/default.ts
    title: Built-in managed block reconciliation plugin
  - id: markdown-plugin
    resource: /src/plugins/markdown/changelog.ts
    title: Markdown changelog line-fold plugin
  - id: scheduler
    resource: /src/runtime/scheduler.ts
    title: Pure plugin scheduler
  - id: plans
    resource: /src/runtime/plans.ts
    title: Named plan application
---

# Check — The Retained-Revision Runtime and CLI Direction

## tl;dr

Yes, the direction is right. The abstraction you have built is not “block-in-file with more options.” It is a small, pure **attributed file-reconciliation runtime**: immutable source revisions, revision-bound facts, checked edit intents with provenance, named plans, and a pass scheduler. That is a genuinely general and useful thing.

The CLI should become a thin host over that runtime. That part is also correct. But the CLI and the proposed `block-in-file/host` subpath are getting too much design airtime relative to the real prize: making the runtime and the plugin-author experience excellent. The main risk right now is not that the abstraction is wrong; it is that you over-invest in the host/CLI migration before proving the runtime has consumers beyond the built-in managed plugin.

My recommendation: ship the thin CLI host, keep host helpers private until a second consumer appears, and redirect the next big chunk of energy toward plugin-author ergonomics and a real out-of-repo plugin (systemd, as already planned). The CLI is one consumer; the runtime is the product.

---

## What you actually built

The recent commits and design docs have produced a coherent kernel:

| Piece | What it is | Why it matters |
|---|---|---|
| `SourceRevision` | Immutable retained text + physical-line index + opaque ID | Coordinates are owned by one snapshot; no accidental stale-offset math. |
| Facts (`Fact`, `FactBatch`, `FactQuery`) | Typed observations about a revision, with origin and optional subject span | Plugins can share observations without sharing parsers. |
| Edit intents (`EditIntent`, `EditInput`) | Checked replacements tied to a revision, with evidence and reason | Every proposed mutation is explainable and auditable. |
| Plans (`PlanSet`, `PlanReport`, `PlanDescriptor`) | Named, selectable groups of edit intents | Hosts can preview, select, or ignore whole policies. |
| `applyPlans` | Validates revision match, bounds, expected text, overlap, then splices right-to-left | One safe, atomic application engine. |
| Scheduler | Topological ordering of passes over one revision | Independent analyzers compose without mutating each other’s source. |
| `SnapshotLinePass` | Stateful line-fold adapter with `finish()` | Deferred decisions (e.g., “insert at next blank line”) are safe and explicit. |
| Managed plugin | Block-in-file behavior as a plugin | Proves the original product survives as one consumer. |
| Markdown changelog plugin | Non-marker, heading-based deferred edits | Proves the runtime is not block-shaped. |

That is not a feature pile. It is a system with a clear contract: **analyze a snapshot, emit attributed facts, plan checked edits, apply them atomically, produce a new snapshot.** That contract is reusable well beyond block-in-file.

---

## What the generic abstraction is

Stop calling it “block-in-file generalized.” Call it what it is:

> **Attributed file reconciliation.**
>
> A host retains an immutable source revision, runs one or more passes that emit origin-attributed facts and checked edit intents, selects named plans, and applies them atomically to produce a new revision. Every observation and every edit carries structured provenance, so conflicts and outcomes are explainable.

That is the abstraction that carries the library into general use. It applies to:

- Configuration-file management (the original use case, now a plugin).
- Changelog / release-note maintenance (the Markdown plugin).
- Systemd unit edits, nginx configs, ssh configs, dotfiles — anywhere a parser can produce facts about a text file and a policy can decide what to change.
- Pre-commit hooks and CI gates that need to report *why* a file was changed.
- License-header management, import sorting, and other “structured but not tree-based” edits.
- Any tool that wants to mutate a file while preserving the parts it does not own.

The key differentiators are not “insert a block” — they are:

1. **Immutability.** Source never changes in place; a new revision is created.
2. **Attribution.** Every fact, diagnostic, edit, and plan knows who produced it.
3. **Checked edits.** An edit carries the expected old text; stale source is rejected rather than silently overwritten.
4. **Atomic plans.** Multiple edits from multiple passes are validated for overlap and applied as one checked splice.
5. **Pass scheduling.** Analyzers depend on each other explicitly; a pass cannot see another pass’s mutations until the host starts a new stage.

That is a strong, compact, defensible abstraction. It is not over-engineered; it is the minimal machinery needed to do safe, explainable file reconciliation.

---

## Assessment: is this the right way?

Yes, with two caveats.

### The right way because:

- You have replaced the old `split("\n")` / reconstruct pipeline with a lossless, coordinate-safe model. The old code was fragile around CRLF, lone CR, missing final newlines, and Unicode. The new model treats those as first-class.
- You have separated **analysis** from **policy** from **application**. The managed plugin is just one policy; the Markdown plugin is another; a systemd plugin can be a third without touching the core.
- The runtime is pure and I/O-free. That makes it testable, portable, and embeddable in editors, CI, servers, and browsers.
- The provenance model is the real product. In a world of AI-generated edits and automated tooling, “who decided this change and on what evidence” is a feature, not a nice-to-have.

### The caveats:

1. **You have not yet proven the plugin contract is usable by outsiders.** Two internal plugins are encouraging, but the real test is whether someone in another repo can write a plugin without reading your source code. The runtime internals are beautiful; the author experience is still unproven.
2. **The CLI/host design is consuming disproportionate energy.** The four CLI drafts are converging on the right answer (thin host), but they are also planning a lot of public surface (`block-in-file/host`, `buildManagedOptions`, `runManagedFile`, `writeAtomic`, `writeText`, etc.) before there is a second consumer. That is premature extraction.

---

## The CLI direction

All four CLI drafts agree: the CLI should become a **thin Node host** over the runtime. That is correct. The current `block-in-file.ts` is a 169-line orchestration that mixes gunshi parsing, file I/O, marker rendering, mode handling, diff rendering, backup, validation, attributes, and output dispatch. It should be much smaller.

The target shape is roughly the mini-m3 draft’s eight-line loop:

```ts
for (const file of files) {
  const result = await runManagedFile({
    file,
    options: buildManagedOptions(cfg, { env: process.env, input: cfg.input }),
  });
  // log result
}
```

That is the right aspiration. But I want to flag three things about the CLI specifically.

### 1. The CLI is a consumer, not the product

The runtime is the product. The CLI is one consumer. If the runtime is good, the CLI becomes small. If the runtime is not good, no amount of CLI refactoring will save the library.

The design docs should not treat “CLI migration” as the main milestone. It is a necessary migration, but the strategic work is:

- stabilize the runtime contract,
- prove it with a non-internal plugin (systemd),
- document how to write a plugin,
- make the `toolkit` export ergonomic for authors.

### 2. The `block-in-file/host` public subpath is premature

The deepseek and glm drafts propose a `block-in-file/host` subpath with many helpers: envsubst, attributes, validation, backup, diff, transforms, atomic-write, write-target, build-request, compose. That is a large public API surface, and it is being justified by the CLI’s needs, not by other consumers.

I recommend:

- Build the host helpers as **private modules** inside the CLI rewrite first.
- Run the CLI through them and make the existing tests pass.
- Only after a second real host consumer appears (e.g., a daemon, an editor integration, another CLI), extract the common helpers into a public `./host` subpath.
- Until then, do not export them. Public API is harder to change than private code.

The mini-m3 draft’s `runManagedFile` and `buildManagedOptions` are useful internally, but they should not be public until they have been shaped by more than one caller.

### 3. The CLI’s surface is becoming strained by the single-command model

`block-in-file` today is one command with ~30 flags. That worked for a single-purpose tool. As the library generalizes, consider whether the CLI should become multi-command:

```
block-in-file insert   ...
block-in-file remove   ...
block-in-file validate ...
block-in-file explain  ...
```

The runtime already supports plan selection and report rendering. A multi-command CLI would let each command have a clear, narrow contract:

- `insert` is the managed-block use case.
- `remove` is the cleanup plugin use case.
- `validate` runs a stage and reports diagnostics without writing.
- `explain` prints facts, plans, and origins for a file (the audit use case).

I do not recommend doing this immediately. The first migration should keep the existing CLI surface to avoid breaking users. But when you add `validate` or `explain`, the multi-command shape is the natural home.

---

## What I would change about the current plan

### 1. Defer the public `./host` subpath

Do the CLI migration with private modules. Do not add `package.json` exports for `./host` until there is a real second consumer. The deepseek draft’s 10-step host module decomposition is too much public surface too early.

### 2. Prioritize the systemd plugin over more CLI host design

The systemd plugin is the right proof point because it:

- is a parser-backed plugin, not a line-fold,
- lives outside the core repo (forcing the plugin contract to be stable),
- has a real use case (editing `ExecStart` in a `[Service]` section),
- requires a validation stage after application, which tests the multi-revision workflow.

Design B in the gpt-5.6-terra draft (the pure reconciliation program) is worth revisiting after the systemd plugin proves that apply-and-reinspect sequencing is painful for hosts to orchestrate manually.

### 3. Write a plugin author guide before expanding the runtime

The `toolkit.ts` export is already 96 lines of re-exports. That is a lot of public API. Before adding more, write a short guide that shows:

- how to write a `SnapshotLinePass`,
- how to write a direct `ReconciliationPass`,
- how to emit facts and edit intents,
- how to declare a plan,
- how to run a scheduler and apply plans,
- how to report diagnostics.

The guide will expose gaps in the author experience more reliably than more design docs.

### 4. Standardize the outcome vocabulary now

The managed plugin emits `managed.outcome` facts. This is a good pattern. The runtime should bless it as a convention: every plugin should emit one outcome fact describing what happened (`kept`, `updated`, `inserted`, `removed`, `skipped`, `adopted`). Hosts should be able to decide whether to write, skip, or fail based on that fact without coupling to plugin internals.

This is one of the open questions in the gpt-5.6-terra draft. I recommend making it a runtime convention.

### 5. Keep the CLI migration small and mechanical

The CLI should be rewritten to use the runtime, but do not let it become a design project. The steps are:

1. Add the managed cleanup plugin for `--remove-all` and `--remove-orphans`.
2. Add host-side `--dos` and `--append-newline` transforms as private helpers.
3. Rewrite `block-in-file.ts` to read, inspect, schedule, select, apply, and write.
4. Delete the legacy parser and orchestration modules once tests pass.

Then stop. The host extraction, multi-command CLI, and advanced runtime features come later, driven by real consumers.

---

## Risks to watch

| Risk | Symptom | Mitigation |
|---|---|---|
| Over-investment in host/CLI before runtime is proven | `block-in-file/host` grows while no external plugin exists | Keep host helpers private; ship systemd plugin first. |
| Plugin author experience is too hard | External author cannot write a plugin without reading your source | Write author guide and one minimal third-party example. |
| Public API surface explodes | `toolkit.ts` keeps growing; every helper becomes public | Curate exports aggressively; defer `./host` until needed. |
| CLI becomes a kitchen sink | Single command accumulates flags for every runtime feature | Plan multi-command migration after initial host rewrite. |
| Generality for generality’s sake | Runtime gains graph queries, transactions, sandboxing before consumers ask | Respect the deferred gates in the retained-revisions design. |
| Idempotence becomes subtle | `ensure` and metadata-only changes behave differently under the new model | Characterize the exact no-op cases and document any changes. |

---

## The bottom line

You are building the right thing. The retained-revision runtime with attributed facts, checked edit intents, named plans, and a pass scheduler is a real, general, and valuable abstraction. It is **attributed file reconciliation**, and it is bigger than block-in-file.

The CLI direction is also right: the command should become a thin host over the runtime. But do not let the CLI migration become the main creative act. The main creative act is the runtime and the plugin author experience. Ship the thin CLI host, keep the host helpers private, and then prove the runtime with the systemd plugin and a plugin author guide.

The biggest risk is not that you built too much. It is that you will keep building host infrastructure for a consumer that does not exist yet, while the consumer that does exist — the plugin author — is still undocumented and unproven.

**Recommended next actions:**

1. Land the managed cleanup plugin and the thin CLI host rewrite in the smallest possible change.
2. Do not add a public `./host` subpath yet.
3. Write the plugin author guide and stabilize the `toolkit` export.
4. Build the systemd plugin in its own repo to validate the external plugin contract.
5. Revisit multi-command CLI and `./host` extraction only after the systemd plugin and author guide are done.

---

## Addendum: how to explain this to other people

If someone asks what `block-in-file` is becoming, do not say:

> “It is a generalization of block-in-file for more file formats.”

Say:

> “It is a small runtime for attributed file reconciliation. You give it a text file and a set of plugins. Each plugin observes the file, emits facts with provenance, and proposes checked edits. The runtime validates those edits, applies them atomically, and reports exactly what changed and why. Managed blocks are just one plugin; the same runtime can edit systemd units, changelogs, or any other text file where you want safe, explainable changes.”

That framing is what makes the library broadly useful. Block-in-file is the first plugin. The runtime is the library.
