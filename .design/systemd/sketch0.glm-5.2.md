---
type: Design sketch
title: Systemd support atop the kernel — the external-consumer probe
description: A concrete sketch for the systemd adapter that proves the retained-source kernel (inspect -> checked plan -> lossless apply -> reparse/validate) against a genuinely external consumer, written against the kernel surface only, per the ds4f review's step 2.
resource: /.design/systemd/sketch0.glm-5.2.md
tags: [block-in-file, systemd, systemd-units, kernel, external-consumer, probe]
status: draft
generated:
  by: model:zai/glm-5.2
  at: 2026-07-31T00:00:00Z
verified: { by: human:pending, at: pending }
stale_after: 2026-10-31
sources:
  - id: ds4f-review
    resource: /.design/check/review.ds4f.0.md
    title: Check the build — kernel-abstraction, systemd adapter probe, demote runtime
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Stage 7 systemd plugin and Grounding section
  - id: systemd-units
    resource: https://github.com/rektide/systemd-units
    title: systemd-units NAPI adapter, rust document crate, first-light tests
  - id: toolkit-surface
    resource: /src/toolkit.ts
    title: Kernel exports used by the adapter
---

# Systemd Support Atop The Kernel

## The Target

[`review.ds4f.0.md`](/home/rektide/src/block-in-file/.design/check/review.ds4f.0.md)
step 2, restated:

> Write the systemd adapter **against the kernel surface only** — `inspect` +
> `UnitDocument` facts + raw plan + `apply` — **without** `createScheduler`,
> `ReconciliationPlugin`, origins, or named plans. Then ask: did I need the
> plugin runtime?

This sketch is that probe, made concrete. It is deliberately an *external*
consumer: the adapter lives in the `systemd-units` repo, not here. That is what
makes it a real proof rather than another self-consumer in this repo.

## Ground Truth: What `systemd-units` Gives Us

Verified against `~/src/systemd-units` (NAPI adapter, rust document crate,
`tests/native/first-light.node.mjs`):

| API | Shape | Notes |
| --- | --- | --- |
| `parseUnit(text)` | `UnitDocument` | Lossless parse; `render()` is identity for unedited source. |
| `.directives()` | `JsDirective[]` | `{ id, section?, key, value, continued, range }` |
| `.range` | `{ start, end }` | UTF-16 offsets, `String.prototype.slice`-safe; **includes directive indentation and trailing whitespace, excludes the physical terminator** (confirmed by test: slice of `"  ExecStart=/usr/bin/example  "`). |
| `.diagnostics()` | `JsDiagnostic[]` | `{ code, message, start, end }` — e.g. `malformed-section`, `assignment-before-section`. |
| `.replaceSingleLineValue(id, replacement)` | `UnitDocument` | Rust-side single-line splice + reparse. **We deliberately do not use it** — the point is proving block-in-file carries the edit. |

The Rust document crate already tracks a `value_range` internally
(`rust/crates/document/src/edit.rs`); the NAPI just does not export it. That
matters for a follow-on, not for this probe.

## Where It Lives

Per the retained-revisions design's Stage 7: hosted by the consumer repo.

```text
~/src/systemd-units/
  src/block-in-file.ts        # the adapter (~120 lines)
  tests/block-in-file.test.ts # the probe suite
  package.json                # + dependency: block-in-file (peer/dep)
```

`block-in-file` gains **zero new code**. Every symbol the adapter needs is
already exported from `src/toolkit.ts`. That non-result is the cleanest
possible kernel validation.

## The Adapter

One function, kernel-only, self-contained:

```ts
import {
  apply,
  checkedSpan,
  inspect,
  isApplyFailure,
  planReplace,
} from "block-in-file/toolkit";
import { parseUnit, type JsDirective, type JsDiagnostic } from "systemd-units";

export type DirectiveSelection = Readonly<{
  section?: string;
  key: string;
  occurrence?: number; // default 0
}>;

export type SystemdReconcile =
  | Readonly<{ ok: true; changed: boolean; text: string; diagnostics: readonly JsDiagnostic[] }>
  | Readonly<{
      ok: false;
      code: "no-match" | "ambiguous" | "continued" | "unsafe" | "invalidated";
      message: string;
      diagnostics: readonly JsDiagnostic[];
    }>;

export function reconcileDirective(
  source: string,
  selection: DirectiveSelection,
  value: string,
): SystemdReconcile {
  const revision = inspect(source);
  const unit = parseUnit(revision.text);
  const before = unit.diagnostics();

  const matches = unit.directives().filter((directive) => isMatch(directive, selection));
  if (matches.length === 0) return fail("no-match", "no matching directive", before);
  if (matches.length > 1) return fail("ambiguous", "selection matches multiple directives", before);
  const target = matches[selection.occurrence ?? 0]!;
  if (target.continued) return fail("continued", "continued directives are not supported yet", before);

  const span = checkedSpan(revision, target.range);
  if (!span) return fail("unsafe", "directive range outside retained source", before);

  const plan = planReplace(
    revision,
    span,
    renderDirective(revision.text, target, value),
    "reconcile systemd directive",
  );
  const change = apply(revision, plan);
  if (isApplyFailure(change)) return fail("unsafe", `apply refused: ${change.code}`, before);

  // validation stage: reparse the next revision, reject regressions
  const next = parseUnit(change.revision.text);
  const regressions = next
    .diagnostics()
    .filter((diagnostic) => !before.some((old) => sameDiagnostic(old, diagnostic)));
  if (regressions.length > 0) return fail("invalidated", "edit introduced diagnostics", regressions);

  const still = next.directives().find((directive) => isMatch(directive, selection));
  if (!still || still.value !== value) {
    return fail("invalidated", "directive no longer has the requested value", next.diagnostics());
  }

  return { ok: true, changed: change.changed, text: change.revision.text, diagnostics: next.diagnostics() };
}
```

### The one fiddly bit: whitespace-preserving rebuild

`JsDirective.range` covers the whole directive (indent through trailing
whitespace). We splice that exact range and rebuild it deterministically from
parts, so surrounding whitespace and the terminator stay stable:

```ts
function renderDirective(source: string, directive: JsDirective, value: string): string {
  const full = source.slice(directive.range.start, directive.range.end);
  const indent = full.slice(0, full.indexOf(directive.key)); // leading whitespace
  const trailing = full.slice(full.trimEnd().length); // trailing whitespace
  return `${indent}${directive.key}=${value}${trailing}`;
}
```

Losslessness is the kernel's job: everything **outside** `target.range` is
untouched, guaranteed by `apply`'s expected-text check. The `expected` is
captured at `checkedSpan` time from the retained text, so a stale or re-read
selection fails with `stale-span` before any splice.

### Idempotence falls out for free

If `value === target.value` already, the plan's replacement equals the
expected text, `apply` returns `{ changed: false }`, and the host writes
nothing. No special-casing.

### Comments are preserved for free

A `#` comment is not a directive, so `parseUnit` returns no `JsDirective` for
it. It contributes no candidate span, no `checkedSpan`, no edit. The kernel
only ever touches bytes inside the *selected* directive's range; every comment,
blank line, unknown section, and tolerated malformed source is retained
byte-for-code-unit. This is a property of the model, not a feature to
implement.

### Continued (multi-line) values are rejected, not handled — and that is a real gap

systemd continuation is `\` + newline + leading whitespace, collapsing into a
single logical value. `systemd-units` exposes this as `directive.continued`.
The probe's guard is:

```ts
if (target.continued) return fail("continued", "continued directives are not supported yet", before);
```

So an `ExecStart=` that line-wraps (the canonical case) returns a structured
`continued` failure today rather than corrupting the value. This is the
conservative, honest v1 behavior — but it is a genuine limitation, not a TODO
hand-wave, because handling it correctly is non-trivial:

1. **`range` semantics under continuation are unverified.** The `first-light`
   test only pins the range for a *single-line* directive. For a continued
   directive the range may cover only the first physical line or may span all
   continuation lines; the adapter must not assume. This has to be pinned down
   with a test before any continuation support lands.
2. **The whitespace-preserving rebuild is single-line-shaped by construction.**
   A multi-line value has multiple terminators and indentation runs that
   `renderDirective` cannot express.
3. **The clean fix is upstream `value_range`, not a smarter rebuild.** The Rust
   crate's `edit.rs` already tracks `directive.value_range` and its
   `replace_single_line_value` *rejects* continued values with
   `EditError::ContinuedValue`. That is the authority: a continued value is not
   safely replaceable as one source range. Multi-line replacement is also
   unsafe by itself (the rust `MultiLineReplacement` and
   `ContinuationInReplacement` errors exist for this), so the adapter would
   mirror those guards.
4. **Realistic path to continuation support:** expose `value_range` (and a
   continued-aware replace) on `systemd-units`, then splice the value range
   directly and drop the whole-directive rebuild. Until then, `continued` is a
   first-class, structured refusal.

`ExecStart=` specifically is the case that forces this work, because real
units routinely continuation-split long command lines.

## The Kernel-Only Contract

Used, all from `block-in-file/toolkit`:

- `inspect` — retained revision + physical-line index
- `checkedSpan` — binds UTF-16 offsets + captures `expected`
- `planReplace` — one checked edit intent
- `apply` / `isApplyFailure` — the sole splice engine

Deliberately **not** used:

- `createScheduler`, `ReconciliationPlugin`, `PassDescriptor`, `after` refs
- `Origin`, `FactId`, `EditId`, `PlanId`, evidence chains, named plans
- `SnapshotLinePass`, `adaptLinePass`, facts/query machinery

The adapter also does the apply → reparse → validate loop by hand in three
lines. (`beginReconciliation` exists in the kernel for the same loop, but the
manual version is clearer here and proves the session is a convenience, not a
dependency.)

## The Verdict This Probe Produces

Walking the runtime checklist: the adapter needs **zero** `src/runtime/`
symbols. The two properties that justify the kernel — stale-source safety and
byte-exact preservation outside the edit — come from `checkedSpan` + `apply`,
which are kernel, not framework.

So the ds4f hypothesis is confirmed before we even ship the probe: **the
plugin runtime is not the spine for a single-domain consumer.** The honest
counterpoint, stated once so it is not forgotten: the runtime earns its keep
only when a host reconciles multiple domains in one file in one stage (managed
blocks + systemd directives + markdown sections, sharing facts and
provenance). Nothing in this probe needs that. The runtime stays available,
not promoted.

## Follow-Ons (Out Of Scope For The Probe)

1. **Continued/multi-line values** — the real gap, detailed in its own section
   above. Needs upstream `value_range` + continued-aware replace on
   `systemd-units`, plus mirrored multiline/continuation guards. `ExecStart=`
   line-wraps are the trigger.
2. **Insert-when-missing** (add a directive under a section that lacks it):
   needs the section header position. `systemd-units` does not expose section
   ranges. Two routes: add a `sections()` API there, or use the kernel's
   `resolvePlacement` with a `line-match` pattern on `/^\[Section\]$/` —
   unique-or-error, which matches the design's placement discipline.
3. **`value_range` on `JsDirective`** (also enables #1): the Rust side already
   tracks it; exposing it would let the adapter splice just the value and
   delete the rebuild function entirely.
4. **Batch updates** (e.g. set three directives in one pass): one `EditPlan`
   with three checked edits; the kernel validates bounds/overlap and applies
   atomically. A nice second test, no new code.

## Acceptance Tests (Port From The Design's Stage 7 List)

- non-ASCII prefix before the selected directive (UTF-16 offsets — the `# 😀` case)
- CRLF source; indentation preserved; trailing whitespace preserved; no final newline
- stale selection against changed text → `stale-span` (kernel)
- ambiguity → `ambiguous`; continuation → `continued` (refused, not corrupted)
- comment lines preserved verbatim alongside an edited directive
- diagnostic regression after edit → `invalidated`
- idempotence → `changed: false`, no write
- bytes outside the directive identical to input (losslessness)

## What "Done" Looks Like

One commit in `~/src/systemd-units`: `src/block-in-file.ts` + its test suite.
Zero commits here. If that lands green, the kernel's generic abstraction is
validated by a genuinely external consumer, the runtime has its honest verdict
(not needed), and the CLI migration can proceed as the third step with a
proven spine underneath.
