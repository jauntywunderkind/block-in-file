---
type: Design review
title: Zoom-out review of the CLI and library direction
description: A synthesis of the four CLI drafts and the retained-revisions design, focused on whether the current direction is right and what the honest generic abstraction carrying this library into general use actually is.
resource: /.design/check/review0.glm-5.2.md
tags: [block-in-file, review, cli, library, abstraction, reconciliation]
status: draft
generated:
  by: model:zai/glm-5.2
  at: 2026-07-31T00:00:00Z
verified: { by: human:pending, at: pending }
stale_after: 2026-10-31
sources:
  - id: retained-revisions-design
    resource: /.design/generalize2.retained-revisions.md
    title: Retained revisions, facts, and checked rewrite passes
  - id: cli-drafts
    resource: /.design/cli/
    title: Four CLI host-migration drafts (glm-5.2, gpt-5.6-terra, deepseek-v4-pro, mini-m3)
  - id: toolkit-surface
    resource: /src/toolkit.ts
    title: Public pure runtime exports
  - id: managed-plugin
    resource: /src/plugins/managed/default.ts
    title: Built-in managed-block plugin
  - id: markdown-plugin
    resource: /src/plugins/markdown/changelog.ts
    title: Experimental Markdown changelog plugin (the generality proof)
---

# Zoom-Out Review Of The CLI And Library Direction

## What The User Asked

> We built so much just now and I'm not sure we're on the right path. What are
> your thoughts on the CLI direction? What is the generic abstraction that
> carries this library into general use broadly across problems?

This review answers three things: (1) what the honest generic abstraction is,
(2) whether the four CLI drafts are pointed at it, and (3) what to actually do.

The short version: **the path is right, and you are further along than the
drafts admit.** The unease is real but its cause is misdiagnosed below.

## Honest Inventory Of What Was Built

Stripped of marketing, the repo today is:

| Layer | Status | Evidence |
| --- | --- | --- |
| Retained-revision kernel (revisions, facts, origins, plans, scheduler, single splice engine) | Done | [`src/toolkit.ts`](/src/toolkit.ts), [`src/runtime/scheduler.ts`](/src/runtime/scheduler.ts); 263 tests across 29 files |
| Managed-block plugin — update/keep/remove/insert/take-over, tags, attribution, additive, anchors | Done, feature-complete except bulk removal | [`src/plugins/managed/default.ts`](/src/plugins/managed/default.ts) (531 lines) |
| Markdown changelog plugin — heading facts, deferred EOF emission, named plan, evidence chain, ambiguity diagnostics | Done and **real**, mislabeled "experimental" | [`src/plugins/markdown/changelog.ts`](/src/plugins/markdown/changelog.ts) (196 lines) |
| CLI on the new runtime | **Not migrated** — still on legacy [`src/file-processor.ts`](/src/file-processor.ts) (400 lines) | [`block-in-file.ts`](/block-in-file.ts) |
| `block-in-file/host` public helper subpath | Proposed by 3 of 4 drafts, not built | `.design/cli/draft.{glm-5.2,deepseek-v4-pro,mini-m3}.md` |

The single most under-credited fact in the design corpus: **the Markdown
changelog plugin is a genuine second plugin, not a toy.** It exercises every
load-bearing runtime capability that distinguishes this kernel from a generic
text-editing library:

- emits revision-bound facts (`markdown.heading`) with a `rule`;
- declares a named plan (`changelog-entry`) rather than relying on `default`;
- performs a deferred edit via `finish()` (the EOF fallback);
- attaches `evidence: [target.fact.id]` linking the edit to the fact that
  justified it;
- emits structured diagnostics for absent and ambiguous selections;
- preserves every byte outside the chosen heading region.

That plugin is the existence proof that the runtime is generic. It should be
**graduated from "experimental" to "the second flagship plugin"**, because it
is doing the job the design corpus assigned to the (still-unbuilt, in-a-sibling-repo)
systemd plugin.

## The Generic Abstraction (The Answer To The Real Question)

The four CLI drafts never name the abstraction. They describe a migration.
Naming it matters, because the README and `package.json` still pitch the v1
product ("insert & update blocks of text in files"), while the library has
quietly become something larger and more legible.

The abstraction is:

> **A desired-state reconciler for regions of a text file.**

Mental model: **Ansible/Terraform for parts of a single file.** You declare
what a region should contain. A plugin observes the current retained source,
locates the region via facts, and derives a minimal, checked, provenance-carrying
edit that makes the region match the desired state — or emits no edit when it
already matches. Everything outside the region is preserved byte-for-code-unit.

Every problem that fits the shape "I have a desired state for some part of a
file" is an instance of this abstraction:

| Domain | "Region" | "Desired state" |
| --- | --- | --- |
| Ansible blockinfile (v1, managed plugin) | marker envelope | block payload |
| systemd units (deferred) | a directive under a section | directive value |
| Markdown changelog (shipped) | a release section | an entry line |
| License header | top-of-file region | SPDX header text |
| Generated TOC | fenced region | rendered table |
| `.gitignore` stanza | labeled block | ignore patterns |
| `package.json` field | a JSON pointer | a value |

Three things distinguish this from a generic text-editing library (ropes,
piece tables, CRDTs, editor `TextDocumentEdit`):

1. **Reconciliation, not editing.** The caller declares desired state, not an
   edit. Idempotence is a first-class outcome (empty plan / `kept`), not an
   emergent property. This is the Terraform borrow.
2. **Lossless retention outside the region.** The splice engine validates
   expected text, bounds, non-overlap, and revision identity. Mixed line
   endings, lone CR, absent final newline, and non-ASCII prefixes outside the
   edited span survive exactly. This is what the retained-revision kernel buys.
3. **Provenance.** Every edit carries a structured `Origin` (plugin/pass/rule/
   invocation) and may cite `evidence` fact IDs. Changes are explainable, not
   just applicable. This is the compiler-pass / analysis-report borrow.

That is the whole abstraction. The kernel (`toolkit`) is the engine; plugins
are where domain knowledge lives; hosts (the CLI, an editor, a CI gate) read a
file, select plans, apply, and write once.

## Are The Four CLI Drafts Pointed At It?

Mostly yes, with three collective weaknesses. All four drafts
([glm-5.2](/home/rektide/src/block-in-file/.design/cli/draft.glm-5.2.md),
[gpt-5.6-terra](/home/rektide/src/block-in-file/.design/cli/draft.gpt-5.6-terra.md),
[deepseek-v4-pro](/home/rektide/src/block-in-file/.design/cli/draft.deepseek-v4-pro.md),
[mini-m3](/home/rektide/src/block-in-file/.design/cli/draft.mini-m3.md))
independently converge on "direct host composition": the CLI becomes a thin
Node host over `inspect()` -> `createScheduler([managedPlugin(opts)])` ->
`applyPlans()`, the legacy `processFile` is deleted, and everything more
general is deferred. That convergence is correct on the mechanics.

Where the corpus is collectively thin:

### Weakness 1: It answers "how do we migrate," not "what are we becoming"

Three of four drafts are dominated by gap tables, deletion lists, and commit
sequences. Only [deepseek-v4-pro](/home/rektide/src/block-in-file/.design/cli/draft.deepseek-v4-pro.md)
seriously engages with reusable modules, and even it lists six tiers without
the unifying thesis ("desired-state reconciliation") that makes the tiers
coherent. The user's "I'm not sure what we've built" is the predictable
symptom of a design corpus that has ninety committed lines of gap analysis
and zero committed lines of product definition.

### Weakness 2: `block-in-file/host` is off-abstraction and oversold

glm-5.2, deepseek-v4-pro, and mini-m3 each propose a public `./host` subpath
exporting `backupFile`, `runValidation`, `applyAttributes`, `atomicWrite`,
`substituteEnvVars`, `generateDiff`. These are generic Node file-effect
helpers. **They have nothing to do with desired-state reconciliation.**
Shipping them as a public surface of *this* library:

- dilutes the product story (is this a reconciler, or a safe-write toolkit?);
- creates a maintenance and versioning surface with no relationship to the
  core abstraction;
- invites consumers whose needs have nothing to do with the kernel and whose
  bugs will land in your issue tracker.

gpt-5.6-terra is the one draft that gets this right: it explicitly defers a
`block-in-file/node` effect-primitives package until "another Node consumer
repeats staging, validation, backup, and rename logic." **Adopt that gate.**
The file-effect helpers stay private inside the CLI until a second host
proves they are shared. The library's public surface is the kernel plus the
plugins — full stop.

### Weakness 3: The "no facades, ever" stance is an overcorrection

gpt-5.6-terra and mini-m3 argue strenuously that any `ensureBlock()` /
`reconcileFile()` facade is forbidden because the v1 `processFile` was a
shallow, policy-hiding monster. The retained-revisions design itself
disagrees: its case-study addendum shows an `ensureBlock({ file, block,
whenPresent, whenMissing })` call as the *ordinary caller* API and says
plainly, "Ordinary callers never need to name a revision, fact, pass, plan,
or origin record."

Reconcile the two positions: the v1 facade was bad because it **hid policy
decisions and mixed I/O** (which diagnostics halt, whether a no-op still
writes, how output modes interact, backup choreography). A *thin, honest,
delegating* facade for ordinary callers — configure a plugin, select its
default plan, apply, return the result, let the host do the one write — is
not that. It is the product.

The right rule is gpt-5.6-terra's section D, stated once and applied
uniformly: **no facade may hide a policy decision.** A facade that only hides
ordinary local plumbing (CLI string parsing, temporary-file sequencing) is
fine and desirable. The drafts lose this distinction in their enthusiasm.

## The One Genuine Redirect

The user's unease is "we built so much, are we on the right path?" The honest
answer is: **yes, and you are further along than the drafts admit.** The
generality the design corpus *asserts* is in fact *demonstrated* by the
Markdown plugin (Weakness 1 above notwithstanding, the code is real). The
kernel is not "managed blocks wearing a costume" — the changelog plugin
refutes that. So the runtime direction is vindicated, not merely promising.

That reframes the actual risk. It is not "we overbuilt a generic kernel for
one plugin." It is:

> The library has become a desired-state reconciler, but it is still
> *positioned, named, and shipped* as "blockinfile v1." The CLI is the only
> real host and it does not use the runtime yet. The migration is the moment
> the abstraction becomes real to users — and the drafts prepare for the
> mechanics of that migration while under-investing in the positioning that
> makes the migration mean something.

Concretely, do three things the drafts collectively miss:

1. **Name and pitch the abstraction.** Update the README and `package.json`
   description from "insert & update blocks of text in files" to the
   desired-state reconciler pitch. The blockinfile CLI is the flagship host
   and the managed plugin is the flagship plugin; they are no longer the
   library's definition. Keywords in `package.json` should gain
   `reconcile`, `desired-state`, `idempotent`.

2. **Graduate the Markdown plugin.** Drop the "experimental" label. It is the
   proof of generality and it should be positioned as such — a first-class
   shipped plugin with a documented use case, not a probe hidden behind an
   "experimental" JSDoc tag. This is the single cheapest, highest-leverage
   move available: the code already exists and the tests already pass.

3. **Do not ship `block-in-file/host`.** Keep file-effect helpers private in
   the CLI. If a second host (editor integration, CI gate, daemon) eventually
   repeats the staging/backup/validate/rename choreography, extract it then,
   as a *separate* package (`safe-write` or similar), not as a subpath of a
   reconciler library.

## Recommended Sequencing (Differs From The Drafts)

The drafts sequence as: close gaps -> migrate CLI -> delete legacy -> maybe
prove generality later. Because generality is **already proven** by the
Markdown plugin, the ordering can be both safer and more honest:

1. **Positioning.** README + `package.json` + graduate the Markdown plugin.
   One commit. No behavior change. This is the grounding move that makes the
   rest legible.
2. **Close the one real feature gap.** `managedCleanupPlugin` for
   `--remove-all` / `--remove-orphans`. mini-m3's slice for this
   ([`.design/cli/draft.mini-m3.md`](/home/rektide/src/block-in-file/.design/cli/draft.mini-m3.md)
   section 1) is correct and small.
3. **Host transforms.** `withDosLineEndings` / `withTrailingBlankLine` as
   **private** CLI helpers, not a public subpath. `--dos` gets honest help
   text admitting it is a whole-document lossy normalization.
4. **Migrate the CLI** to a direct host over `managedPlugin`. Keep a thin
   `runManagedFile` private helper; do not export it. Run the characterization
   suite as the gate.
5. **Delete legacy** (`file-processor.ts`, `block-parser.ts`,
   `conflict-detection.ts`, `block-remover.ts`, `mode-handler.ts`,
   `output.ts`, `src/managed/`) only after the characterization suite is green.
6. **Then, not before:** decide whether a thin `ensureBlock`-style facade is
   worth exporting for ordinary programmatic callers. The retained-revisions
   design says yes; the CLI drafts say no. Resolve it from real demand, not
   from principle.

Steps 1-3 are low-risk and independently shippable. Step 4 is the load-bearing
one and it is safer than the drafts imply, because the runtime is already
proven generic.

## What To Explicitly Not Do

- **Do not** build the `ReconciliationJob` declarative abstraction (glm-5.2
  alternative C, gpt-5.6-terra alternative B). Defer until a second host exists.
- **Do not** build multi-revision pipelines inside the scheduler (alternative
  D). Defer until a maintained consumer needs apply-and-reinspect that host
  orchestration cannot express. The systemd reparse-and-validate gate is the
  canonical trigger and it is not built.
- **Do not** split into `@block-in-file/*` packages (alternative F). Defer
  until independently-authored plugins create versioning friction.
- **Do not** build `block-in-file/host` as a public surface. (See Weakness 2.)
- **Do not** rename the package. `block-in-file` keeps the discovery surface
  and the flagship CLI; the abstraction lives in the pitch and the `./toolkit`
  subpath, not in the name.

## Tensions Worth Naming

These are not resolved by this review; they are the real open questions.

1. **Facade or no facade for programmatic callers.** The retained-revisions
   design says "yes, `ensureBlock`." The CLI drafts say "no, direct
   composition only." Both cite the same v1 `processFile` as cautionary tale.
   The resolution is the rule in Weakness 3 (no hiding policy), not a blanket
   yes/no. Decide from a real programmatic consumer when one appears.
2. **`--dos` is philosophically incompatible with the library.** It is a
   whole-document lossy normalization, and the library's whole value
   proposition is lossless retention outside the edited region. Keep it as a
   documented opt-in host transform, but recognize it is a compatibility
   wart, not a feature. A future major version can deprecate it.
3. **The systemd plugin is the named generality proof but it lives in a
   sibling repo that does not exist yet.** The Markdown plugin is the *actual*
   proof and it is in-tree. Reconcile the narrative: either build a minimal
   systemd plugin in-tree to match the design's promise, or rewrite the
   promise to credit the Markdown plugin. The latter is cheaper and honest.

## Bottom Line

You are on the right path. The retained-revision kernel is the correct
abstraction and it is already proven generic by a real second plugin that the
design corpus persistently under-credits. The CLI "direct host" direction is
correct. The three things to fix are positioning, not architecture:

- **Name the abstraction** (desired-state reconciliation for text regions) and
  update the pitch.
- **Graduate the Markdown plugin** from "experimental" to "second flagship."
- **Do not ship `block-in-file/host`**; keep file-effect helpers private.

Then migrate the CLI with more confidence than the drafts allow themselves,
because the runtime they are migrating onto is already doing the job the
drafts only promise it can do.
