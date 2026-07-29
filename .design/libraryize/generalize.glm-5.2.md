---
type: Exploration
title: The meta — block-in-file as a composable stream processor over physical lines
description: Names the broadest abstraction the v2 design keeps almost-saying without committing to: a deterministic, composable, line-oriented stream processor over retained source text that emits facts and edits. Shows how the current ownership modes are one family of pre-built processors, what becomes expressible under the meta, and why the framework should not be built until a second consumer proves the shape.
resource: /.design/libraryize/generalize.glm-5.2.md
tags: [block-in-file, exploration, generalization, stream-processor, transducer, compiler-pass, lint-fixer, processor, ownership-modes]
status: draft
generated:
  by: model:zai-coding-plan/glm-5.2
  at: 2026-07-29T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: v2-spec
    resource: /.design/libraryize/draft.gpt-5.6-terra.md
    title: block-in-file v2 — lossless text reconciliation (the spec being implemented)
  - id: glm-synthesis-addendum-2
    resource: https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/syn-ambition.glm-5.2.md
    title: glm-5.2 synthesis with cross-review addenda (baseline verdict)
  - id: transcript
    resource: https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/ambition-transcript.md
    title: block-in-file library-ization ambition transcript
  - id: current-source
    resource: /src/
    title: current block-in-file v2 source (implements the spec)
---

# The meta — block-in-file as a composable stream processor over physical lines

## What this document is

An exploration, not a spec. The spec ([`draft.gpt-5.6-terra.md`](/.design/libraryize/draft.gpt-5.6-terra.md)) is being implemented and 321 tests pass against it. This doc names a generalization that the spec keeps approaching from several angles — ownership modes, `ContextTracker`, inspectors, sessions — without committing to as its spine. The purpose is to make the generalization visible so the next consumer can be written deliberately, and so the question "should we promote this to a framework?" has a concrete shape to evaluate against rather than a vague feeling.

The thesis, in one paragraph: **block-in-file is a composable stream processor over physical lines that emits facts and edits, with a runtime that handles coordinate translation, edit ordering, and lossless application. The four ownership modes (managed, adopt, take-over, raw) are one family of pre-built processors. `ReconciliationSession` is the pass manager. `ContextTracker<State>` is a state-only processor that doesn't yet emit edits. The whole v2 design keeps re-discovering "stream processor" from different angles without naming it as the spine.** This doc names it, shows what it unlocks, and argues for not building the framework until a second real consumer proves the shape.

## The observation

The spec centers on four ownership modes:

| Mode | Intent |
| --- | --- |
| Managed | Own a named region across runs, marker-wrapped, idempotent by name. |
| Adopt | Wrap existing text in markers, payload unchanged. |
| Take over | Replace existing text with a managed block. |
| Raw | Make an intentional unmarked source change. |

These are useful and they ship. But they are not the meta. They are four recognizable shapes of one underlying thing, and that thing is never named in the spec. The ownership vocabulary is anchored to block-in-file's marker-based heritage — raw mode is defined in opposition to managed mode ("without markers"), which still centers markers as the reference frame.

The broader question, raised in the [ambition transcript](https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/ambition-transcript.md) and never quite answered: what does it look like to **loop through a file doing arbitrary things as we go**? "Arbitrary things" includes editing text, tracking state, emitting facts, making decisions based on past state, deferring decisions based on future state, composing multiple rules, and coordinating across passes. The ownership-mode framing can express some of these by composition; it cannot express all of them naturally.

## Naming the meta

**block-in-file is a composable stream processor over physical lines that emits facts and edits, with a runtime that handles coordinate translation, edit ordering, and lossless application.**

Several lenses converge on the same idea:

| Lens | What block-in-file is under that lens |
| --- | --- |
| Compiler pass framework | A one-pass compiler over config text. The IR is physical lines. Passes emit facts (analyses) and edits (transforms). The pass manager chains passes. |
| Lint engine with fixers | ESLint rules over a source file. Each rule can emit diagnostics and autofixes. Rules compose. |
| awk with types and checks | Line-oriented stream editor where rules compose, state is typed, and edits are checked against expected source. |
| Transducer | Stateful reducing function over a sequence, emitting zero or more outputs per input, composable with other transducers. |
| SAX parser with mutation | Event-driven traversal of source structure, where handlers can mutate the stream as it flows past. |

The compiler-pass analogy is probably the cleanest because it captures the analysis-vs-transform distinction (the spec's inspectors vs planners) and the pass-manager role (the spec's `ReconciliationSession`). LLVM didn't start with a pass manager — it started with one pass, then two, then generalized. block-in-file is in the same spot.

## The current design under this framing

Every concept in the v2 spec is one configuration of the meta:

| Current concept | Generalized form |
| --- | --- |
| `ContextTracker<State>` | A **state-only processor** — accumulates state, emits nothing. ([`src/document/context.ts`](/src/document/context.ts)) |
| `Inspector` | An **analysis pass** — reads lines, emits facts, no edits. ([`src/document/types.ts`](/src/document/types.ts)) |
| `planBlock` / `reconcileBlock` | A **transformation pass** — emits edits (specifically: marker-wrapped edits). ([`src/managed/default.ts`](/src/managed/default.ts)) |
| `replaceChecked` / `planInsert` | A **transformation pass** — emits edits (raw). ([`src/reconcile/raw.ts`](/src/reconcile/raw.ts)) |
| `ReconciliationSession` | The **pass manager** — chains passes, each sees fresh output of the previous. ([`src/reconcile/session.ts`](/src/reconcile/session.ts)) |
| Ownership modes | **Pre-built passes** in a library: `managedPass`, `adoptPass`, `takeOverPass`, `rawPass` |

The generalization is small at the type level. Extend `ContextTracker` to emit edits per step:

```ts
// today: state only
export type ContextTracker<State> = Readonly<{
  initial(): State;
  advance(state: State, line: PhysicalLine): State;
}>;

// generalized: state + emissions
export type Processor<State, Fact, Edit> = Readonly<{
  initial(): State;
  advance(state: State, line: PhysicalLine): Readonly<{
    state: State;
    facts?: readonly Fact[];
    edits?: readonly Edit[];
  }>;
}>;
```

That is the entire delta at the type level. `ContextTracker<State>` is `Processor<State, never, never>` — a processor that emits nothing. `Inspector` is `Processor<void, Fact, never>` — stateless, emits facts only. The four ownership modes are stateless processors that emit edits.

The hard part is not the type. The hard part is the runtime:

- how edits from multiple processors compose against the same source;
- how offsets resolve when an earlier emission in the same pass shifts later coordinates;
- whether re-inspection happens between passes (current `ReconciliationSession`) or within a pass (deferred emission against original offsets);
- how to express "I want to do something later, based on what I see now" without breaking the single-pass invariant.

These are open. They should stay open until they're not.

## What becomes expressible under the meta

Each row is something awkward or impossible in the current inspect→query→plan→apply lifecycle, and natural in a single traversal with state and edit emission.

| Want | Current design | Under the meta |
| --- | --- | --- |
| Take over every `ExecStart=` in the file as a managed block | Caller enumerates each directive upfront, building one `EditPlan` per occurrence | One rule, fired per matching line, emits take-over edits as it walks |
| Inside `[Service]`, manage; inside `[Unit]`, just annotate | Impossible without a hand-written tracker that schedules different policies per scope | `scopeRule("Service", managedPass(...))` composes with `scopeRule("Unit", annotatePass(...))` |
| Wherever I see X, insert Y after the next blank line | Impossible — no deferred emission; current placement is immediate | A stateful rule that buffers the edit until the blank line, then emits |
| Validate every directive and emit fixes for the wrong ones | Inspect, query, plan as separate phases; caller threads results between them | One pass that emits facts *and* fix-edits together |
| Run a cleanup pass after the ownership pass | Session does this implicitly via re-inspection | Explicit pass pipeline: `[managedPass(...), cleanupPass(...)]` |
| Replace every `Key=value` matching a schema violation | Manual enumeration after a query | A stateful rule that consults a schema and emits raw edits per match |
| Convert a file from format A to format B | Out of scope; the library is not a formatter | A stateful transform pass that emits replacement text per logical region |

The **deferred-emission** row is the real tell. "I want to do something later, based on what I see now" is awkward in inspect→query→plan→apply because by the time you plan, you've finished inspecting and lost the per-line decision context. It is natural in a single traversal with state — you stash the intent in the accumulator and emit the edit when the trigger condition fires later in the walk.

This is the capability that awk has and the current spec doesn't. It's also the capability that makes the difference between "manage these specific blocks I named upfront" and "walk this file and do the right thing as you go."

## What this does *not* claim

- It does **not** claim the current spec is wrong. The spec is correctly under-built. The four ownership modes ship. `ReconciliationSession` ships. `ContextTracker` ships. They cover the systemd-units adapter's needs and the CLI's needs.
- It does **not** claim the meta should be built next. Building a `Processor<State, Fact, Edit>` framework before a second consumer exercises it is the kind of premature abstraction the [synthesis](https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/syn-ambition.glm-5.2.md) explicitly warned against.
- It does **not** claim the meta is the last word. The meta itself has a meta — "composable source transformations" — which could go further (streaming, graph-shaped source, multi-file coordination). Those are out of scope for a small-config-file library.

The doc's job is to make the generalization visible so it can be recognized when it arrives in working code, not to push it into the code ahead of evidence.

## The discipline case (or: why not build this now)

The synthesis landed on promotion gates for a reason. Generic frameworks that ship before two real consumers exercise them tend to:

1. **Get the abstraction slightly wrong.** The first consumer's needs look general because there's nothing to compare against. The shape that looks like `Processor<State, Fact, Edit>` for one consumer might actually be `Processor<State, Edit>` (facts fall out of band) or `Processor<State, Fact, Edit, SideChannel>` (something else is needed) for the next. You can't tell from one.

2. **Scare off ordinary users.** A user who wants `manageBlock(text, { name: "app", content: "..." })` does not want to learn what a `Processor` is first. The default assembly must remain the easy door. Publishing the framework as the spine raises the floor for everyone who isn't writing a novel assembly.

3. **Freeze the wrong interface.** Once `Processor<State, Fact, Edit>` is public, its shape is locked. If real consumers later demonstrate that edit emission needs ordering constraints (e.g. "edits from this pass must apply before edits from that pass, even if their offsets overlap"), or scope-conditional activation, or deferred emission with re-inspection semantics, the public surface has to migrate.

4. **Make the second consumer harder to write, not easier.** This is the counterintuitive part. A pre-built framework imposes its own vocabulary on the second consumer. Writing the second consumer against today's primitives — `inspect`, `walk`, `planBlock`, `ReconciliationSession` — leaves the consumer free to find its own shape. The shared shape between two real consumers *is* the framework. The framework designed ahead of the consumers is a guess.

The cost of waiting is small: two consumers write ~30 lines of similar wrapper code around `ContextTracker`. The cost of building early is large: a public framework that constrains the implementation and has to be migrated later.

## The concrete path

The path that actually earns the generalization:

### 1. Write the systemd-units adapter against today's primitives

The first real consumer. It will be ~50 lines: take a `UnitBlockRequest`, ask `UnitDocument` for a directive range, convert UTF-8 to UTF-16, call `planBlock` with `whenMissing: { kind: "take-over", ... }` or `{ kind: "insert", ... }`, apply, reparse, check diagnostic delta. It will not need `Processor<State, Fact, Edit>`. It will not even need `ContextTracker`. The spec already covers it.

### 2. Write a second consumer that is genuinely different from systemd

This is the load-bearing step. The second consumer should not be another config-file editor with sections and directives. It should stress different parts of the design. Candidates:

- **A dotfile manager** that walks `~/.bashrc`, `~/.gitconfig`, `~/.ssh/config` and manages blocks across multiple files. Different because: shell-ish formats with no formal sections, multiple files coordinated, idempotent across a fleet.
- **A CI/CD injection tool** that walks a YAML file and inserts managed snippets at schema-aware positions. Different because: YAML has nested structure (not flat sections), schema-aware placement, generation-time content.
- **A markdown annotator** that walks prose, finds code blocks, and wraps or transforms them. Different because: not a config file at all, structure is paragraph-and-fence-based, content is human-readable prose with embedded code.
- **A changelog manager** that walks `CHANGELOG.md`, finds the right section, inserts entries under the right heading. Different because: heading-based structure, append-mostly semantics, human-readable.

The second consumer's needs are what determines whether `Processor<State, Fact, Edit>` is the right shape, or whether the actual shared primitive is something narrower (e.g. just a `LineVisitor` with edit emission) or something broader (e.g. multi-pass coordination with dependency tracking).

### 3. Look at what the two consumers share

If both end up writing the same wrapper around `ContextTracker` that emits edits, that wrapper is the `Processor` type. Promote it.

If they don't share a wrapper, the generalization is wrong. Either the consumers are too different (in which case the spec's current shape is correct and there is no meta to extract) or the right generalization is something other than `Processor<State, Fact, Edit>` (in which case building the wrong one would have hurt).

### 4. Promote only when the shape is visible in working code

The current `ContextTracker` is already 80% of `Processor<State, Fact, Edit>` — it just doesn't emit edits. Adding edit emission is a small change *once a second consumer proves it's the right shape.* Until then, leave `ContextTracker` as state-only and let consumers compose it with `planBlock` and `apply` explicitly.

## What to watch for in the second consumer

When the second consumer is being written, these are the signals that the meta is real and worth promoting:

| Signal | What it means |
| --- | --- |
| The consumer writes a wrapper around `ContextTracker` that buffers edits and flushes them per-line or per-scope | `Processor<State, Fact, Edit>` is the right shape. Promote. |
| The consumer needs to emit edits based on state accumulated during the walk, not just based on facts queried after inspection | Deferred emission is real. The single-pass-with-state model is needed. |
| The consumer writes its own scope-detection logic that looks like systemd's section-detection with different predicates | A `ScopeDialect` or `ScopeTracker` is the shared primitive, not the full `Processor`. Promote that instead. |
| The consumer wants to chain multiple rules that interact (rule A's emission triggers rule B) | The pass manager (`ReconciliationSession`) needs to be more than re-inspect-after-each-step. Compose passes with dependencies. |
| The consumer doesn't need any of the above | The current spec is correct. The meta is "library of ownership modes plus session," not "composable processors." Don't generalize. |

The last row is a real possibility. The ambition to generalize may be a response to the spec's density, not to a real gap. The second consumer is the test.

## Relationship to the v2 spec

This doc is not a counterproposal to [`draft.gpt-5.6-terra.md`](/.design/libraryize/draft.gpt-5.6-terra.md). The spec is correct and it's being implemented. This doc is a map of where the spec *might* go next, after the first consumer ships, *if* a second consumer demonstrates the need.

The spec's existing primitives are the right primitives to build on:

- `ContextTracker<State>` is the seed of `Processor<State, Fact, Edit>`. The generalization is: add edit emission. Don't do it yet.
- `Inspector` is the seed of an analysis pass. The generalization is: analysis passes compose with transform passes in a pipeline. Don't do it yet.
- `ReconciliationSession` is the seed of a pass manager. The generalization is: passes declare dependencies and the manager orders them. Don't do it yet.
- The four ownership modes are pre-built transformation passes. The generalization is: users write their own passes. Don't do it yet.

Each of these is one small step away from the current code. None of them should be taken until a consumer proves the step is needed.

## The risk of writing this doc at all

Naming a generalization creates pressure to build it. The promotion-gates discipline exists to resist that pressure. This doc is written on the assumption that the reader (and the next contributor) will treat it as a map of possible futures, not a backlog. If reading this doc makes the next contributor think "we should refactor `ContextTracker` to emit edits before writing the systemd adapter," the doc has done harm. The systemd adapter should be written against today's spec. So should the second consumer. The generalization, if it comes, comes after both ship.

The doc exists because the generalization was already implicit in the design — visible in the parallel between `ContextTracker`, `Inspector`, `planBlock`, and the ownership modes, but not named. Better to name it, mark it as deferred, and move on, than to leave it as an unspoken pressure that shapes decisions without being examined.

## Bottom line

The broadest meta is composable stream processing over physical lines, with state, facts, and edit emission. The v2 spec contains all the seeds of this meta in disconnected form: `ContextTracker`, `Inspector`, `planBlock`, `ReconciliationSession`. None of them are connected into a single `Processor` abstraction, and they shouldn't be until a second consumer proves the connection.

The path is: ship the v2 spec as written, write the systemd adapter, write a deliberately-different second consumer, examine what they share, promote the shared shape if and only if it earns promotion through the existing gates.

The current design isn't under-built by accident. It's under-built on purpose. This doc names what the next build-out would look like, so that when it arrives it arrives deliberately.

## References

- [`draft.gpt-5.6-terra.md`](/.design/libraryize/draft.gpt-5.6-terra.md) — the v2 spec being implemented (also at [`systemd-units/.design/block-in-file/draft.gpt-5.6-terra-2.md`](https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/draft.gpt-5.6-terra-2.md))
- [`syn-ambition.glm-5.2.md`](https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/syn-ambition.glm-5.2.md) — the synthesis that landed on promotion gates (Addendum 2 picks the gpt-5.6-terra baseline)
- [`ambition-transcript.md`](https://github.com/rektide/systemd-units/blob/main/.design/block-in-file/ambition-transcript.md) — the original "loop through the file doing arbitrary things" ask
- [`src/document/context.ts`](/src/document/context.ts) — `ContextTracker<State>` as currently shipped (state-only, no edit emission)
- [`src/reconcile/session.ts`](/src/reconcile/session.ts) — `ReconciliationSession` as currently shipped (re-inspect after each step)
- [`src/managed/default.ts`](/src/managed/default.ts) — `planBlock` / `reconcileBlock` (the pre-built transformation passes)
