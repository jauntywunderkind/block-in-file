---
type: Design review
title: Zoom-out review, revised after direction feedback
description: Revision of the zoom-out review incorporating the corrected direction — a battery-included text-processing toolkit. Retires the "host" framing, exposes file operations as library content, and refines no-facades into "compositional helpers and builders yes, interface wrappers no."
resource: /.design/check/review1.glm-5.2.md
tags: [block-in-file, review, cli, library, toolkit, battery-included]
status: draft
generated:
  by: model:zai/glm-5.2
  at: 2026-07-31T00:00:00Z
verified: { by: human:pending, at: pending }
stale_after: 2026-10-31
sources:
  - id: review0
    resource: /.design/check/review0.glm-5.2.md
    title: Original zoom-out review
  - id: user-correction
    resource: "session"
    title: Direction feedback — battery-included toolkit, retire "host", multiple libraries, no-facades refined
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Retained revisions, facts, and checked rewrite passes
  - id: cli-drafts
    resource: /.design/cli/
    title: Four CLI drafts
---

# Zoom-Out Review, Revision 1

## What This Revises

review0 concluded: keep file-effect helpers private in the CLI, and keep a thin
facade for ordinary programmatic callers. The user corrected the direction:

> The battery-included toolkit for text processing is the goal. People should
> be able to easily quickly do anything block-in-file does with this library —
> not less. I hate the term "host." Probably it should be broken into multiple
> libraries. No facades: I'd rather people assemble a toolkit. If we want to
> precompose pieces, build helpers or builders — that's fine, that's different.
> There's no value in just wrapping interfaces.

This revision retracts the parts of review0 that conflict with that and
restates the corrected direction.

## Retracted

1. **"Don't ship the file-effect helpers."** Wrong. If a library consumer
   cannot reproduce everything block-in-file does — read, envsubst, reconcile,
   backup, validate, attributes, atomic write, diff — the battery is not
   included. The operations are library content, not CLI-private plumbing.
2. **"Keep a thin `ensureBlock` facade for ordinary callers."** The user's
   refinement is better than my framing. No wrapper that just hides interfaces.
   Composition that reduces assembly burden is the product, not a violation.
3. **The term "host."** Jargon from the plugin world implying the library is a
   guest being hosted. Retire it.

## Vocabulary: Kernel / Operations / CLI

The CLI is not a host. It is an application of the toolkit. Three libraries:

- **kernel** — the pure reconciliation engine: retained revisions, facts,
  origins, named plans, the pass scheduler, the line-pass adapter, and the
  plugins (managed, markdown). No I/O, no clock, no environment. Runs in any
  JS runtime. ([`src/toolkit.ts`](/src/toolkit.ts) is most of this already.)
- **operations** — the battery for anyone doing block-in-file-style work on a
  filesystem: read, envsubst, backup, validation, attributes, staged/atomic
  write, diff. Node-only. These are library functions, not "host effects."
- **CLI** — the reference application. Deliberately the thinnest thing that
  satisfies every existing CLI behavior.

"Probably multiple libraries" points at exactly these three seams. Whether they
ship as one package with subpath exports or as separate packages is a packaging
decision; the experience must be battery-included either way — a root entry
that re-exports everything a Node consumer needs.

## The Success Criterion (the battery, made testable)

> Every behavior block-in-file exposes from the CLI must be reproducible by a
> library consumer in a handful of lines.

The CLI rewrite is the acceptance test for the toolkit, not the other way
around. If writing the CLI requires a helper that lives only in the CLI, the
toolkit is incomplete. The CLI body should be a literal assembly of public
kernel + operations calls:

```ts
const revision = inspect(await readText(path));
const scheduler = createScheduler([managedPlugin(await buildManagedOptions(...))]);
const report = scheduler.run(revision);
const applied = applyPlans(revision, selectCliPlans(report), report.plans);
if (applied.changed) {
  await commitRevision({ target: path, text: applied.revision.text, options });
}
```

Nothing in that loop is CLI-private except the flag translation.

## No-Facades, Refined

The principle stands: no wrapper that hides interfaces. But there is a real
distinction between a wrapper and a helper:

- **primitives** — `inspect`, `createScheduler`, `managedPlugin`, `applyPlans`,
  `stageAtomicWrite`, `runValidation`, ... exposed, well-named, well-typed.
  Callers assemble them freely.
- **builders** — functions that construct option shapes (e.g.
  `buildManagedOptions(description)` producing a `ManagedPluginOptions`) so
  callers do not hand-assemble complex configuration.
- **helpers** — assembled pipelines (e.g. a `reconcileFile(path, ...)` that
  wires read, reconcile, backup, validate, atomic write in a sensible default
  order) with every piece beneath them still importable individually.

Rule of thumb: a function earns its place if it removes genuine assembly burden
or encodes a safe default. It does not earn its place if it only renames a
longer call chain.

### Guardrail: policy stays at the edge

The one thing a helper must not do is accept CLI-flag-shaped input and resolve
policy internally. Example of a legitimate helper:

```ts
reconcileFile(path, {
  plugins,
  select,
  write: { backup, validate, attributes, atomic: true },
});
```

This takes *policy-resolved* inputs. What stays in the CLI: parsing flags,
deciding whether a no-op still writes, which output target applies, `mode`
semantics. Policy at the edge; composition in the library. That is the boundary
that keeps helpers honest and prevents a second `processFile`.

## What Stays From review0

- **Name the abstraction.** Desired-state reconciliation for regions of a text
  file; a text-processing toolkit. The README and `package.json` still describe
  v1 blockinfile ("insert & update blocks of text in files") and need the
  updated pitch. (User agrees; tracked.)
- **Graduate the Markdown plugin.** Drop "experimental." It already proves the
  kernel is generic — named plans, evidence chains, deferred EOF emission,
  structured diagnostics. It is the second flagship plugin, not a probe.
- **Defer** multi-revision pipelines, declarative job abstractions, per-plugin
  packages, and dynamic plugin loading until a real consumer forces each.

## Revised Sequencing

1. **Expose the operations library.** Move the effects currently buried in
   [`src/file-processor.ts`](/src/file-processor.ts) and [`src/output.ts`](/src/output.ts)
   into a public operations surface with their own tests. This is the biggest
   single step toward "battery included."
2. **Graduate the Markdown plugin** and update the pitch (README +
   `package.json`).
3. **Rewrite the CLI as an assembly of public calls** — the battery-included
   acceptance test. Every CLI behavior must map to kernel + operations calls.
4. **Delete legacy** (`file-processor.ts`, `block-parser.ts`,
   `conflict-detection.ts`, `block-remover.ts`, `mode-handler.ts`,
   `output.ts`, `src/managed/`) once the CLI is green.
5. **Resolve packaging** — subpaths vs. separate packages — from how the
   operations layer lands, not from principle.

## Open Questions

- Packaging: one package with subpaths, or `@block-in-file/{kernel,operations}`
  plus the CLI? Battery-included experience is required either way.
- Do the plugins (managed, markdown) become separate libraries now, or stay in
  the kernel library until a third-party plugin forces the split?
- Which operations deserve composed safe defaults (stage + validate + backup +
  rename as one helper) vs. staying primitives?

## Bottom Line

The corrected direction: **block-in-file is a battery-included text-processing
toolkit.** Kernel (pure engine) + operations (Node battery) + CLI (reference
application). No "host." No interface wrappers. Compositional helpers and
builders are the product, and policy lives at the edge. Success is measured by
one testable promise: anything the CLI does, the library does in a few lines.
