import { resolvePlacement } from "../../reconcile/placement.ts";
import { inheritedTerminator, type PhysicalLine } from "../../source/lines.ts";
import { checkedSpan, sourceSpan, type CheckedSpan, type SourceSpan } from "../../source/spans.ts";
import { addTags, parseTags, stripTagsForMatching, type Tag } from "../../tags/tags.ts";
import { applyTagMode } from "../../tags/tag-merger.ts";
import type { TagMode } from "../../tags/tag-mode.ts";
import type { BlockRequest, ManagedOutcome } from "../../managed/default.ts";
import type { MarkerDialect } from "../../managed/markers.ts";
import {
  inspectManagedAnchors,
  resolveManagedAnchorPlacement,
  type ManagedAnchor,
  type ManagedAnchorObservation,
} from "./anchors.ts";
import { adaptLinePass, type SnapshotLinePass } from "../../runtime/line-pass.ts";
import type { Fact } from "../../runtime/facts.ts";
import type {
  PassContext,
  PluginManifest,
  ReconciliationPass,
  ReconciliationPlugin,
} from "../../runtime/plugin.ts";

type ManagedBlockObservation = Readonly<{
  opener: PhysicalLine;
  closer: PhysicalLine;
  content: CheckedSpan;
  envelope: SourceSpan;
}>;

type ScanState = Readonly<{
  opener?: PhysicalLine;
  blockCount: number;
  invalid: boolean;
}>;

type IntegrityObservation = Readonly<{ valid: boolean; blockCount: number }>;

type ObservedBlock = Readonly<{ fact: Fact; value: ManagedBlockObservation }>;

type ObservedAnchor = Readonly<{ fact: Fact; value: ManagedAnchorObservation }>;

export type { ManagedAnchor } from "./anchors.ts";

/** Placement policy for lines newly added to an existing managed payload. */
export type AdditivePolicy = Readonly<{
  before?: "BOF" | RegExp;
  after?: "EOB" | "EOF" | RegExp;
}>;

/** Configuration for the built-in managed-block reconciliation plugin. */
export type ManagedPluginOptions = BlockRequest &
  Readonly<{
    manifest?: PluginManifest;
    tags?: readonly Tag[];
    tagMode?: TagMode;
    sourceLine?: string;
    sourceLinePrefix?: string;
    additive?: AdditivePolicy;
    anchor?: ManagedAnchor;
  }>;

function normalize(dialect: MarkerDialect, text: string): string {
  return (dialect.normalize ?? ((line) => line.trim()))(text);
}

function render(
  dialect: MarkerDialect,
  content: string,
  terminator: string,
  trailing = "",
  opener = dialect.opener,
  sourceLine?: string,
): string {
  const normalized = content.replace(/\r\n|\r|\n/g, terminator);
  const body = sourceLine
    ? `${sourceLine}${normalized.length > 0 ? terminator : ""}${normalized}`
    : normalized;
  const contentTerminator = body.length > 0 && !body.endsWith(terminator) ? terminator : "";
  return `${opener}${terminator}${body}${contentTerminator}${dialect.closer}${trailing}`;
}

function outputOpener(options: ManagedPluginOptions, existing: readonly Tag[] = []): string {
  const tags = options.anchor
    ? [
        ...(options.tags ?? []),
        { name: `anchor-${options.anchor.type}`, value: String(options.anchor.priority) },
      ]
    : [...(options.tags ?? [])];
  return addTags(
    options.block.dialect.opener,
    applyTagMode([...existing], tags, options.tagMode ?? "merge"),
  );
}

function insertionText(context: PassContext, at: number, options: ManagedPluginOptions): string {
  const terminator = inheritedTerminator(context.revision.lines);
  const before = context.revision.text.slice(0, at);
  const after = context.revision.text.slice(at);
  const prefix = before.length > 0 && !/[\r\n]$/.test(before) ? terminator : "";
  const suffix = after.length > 0 ? terminator : "";
  return `${prefix}${render(
    options.block.dialect,
    options.block.content,
    terminator,
    "",
    outputOpener(options),
    options.sourceLine,
  )}${suffix}`;
}

function isManagedBlock(value: unknown): value is ManagedBlockObservation {
  return (
    typeof value === "object" &&
    value !== null &&
    "opener" in value &&
    "closer" in value &&
    "content" in value &&
    "envelope" in value
  );
}

function isIntegrity(value: unknown): value is IntegrityObservation {
  return (
    typeof value === "object" &&
    value !== null &&
    "valid" in value &&
    "blockCount" in value &&
    typeof value.valid === "boolean" &&
    typeof value.blockCount === "number"
  );
}

function emitOutcome(context: PassContext, outcome: ManagedOutcome): void {
  context.emit.fact({ kind: "managed.outcome", value: { outcome }, rule: "ownership" });
}

function observedBlocks(context: PassContext): readonly ObservedBlock[] {
  return context.facts
    .kind("managed.block")
    .flatMap((fact) => (isManagedBlock(fact.value) ? [{ fact, value: fact.value }] : []));
}

function isManagedAnchor(value: unknown): value is ManagedAnchorObservation {
  return (
    typeof value === "object" &&
    value !== null &&
    "anchor" in value &&
    "span" in value &&
    typeof value.anchor === "object" &&
    value.anchor !== null &&
    "type" in value.anchor &&
    "priority" in value.anchor
  );
}

function observedAnchors(context: PassContext): readonly ObservedAnchor[] {
  return context.facts
    .kind("managed.anchor")
    .flatMap((fact) => (isManagedAnchor(fact.value) ? [{ fact, value: fact.value }] : []));
}

function matches(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function contentLines(context: PassContext, block: ObservedBlock): readonly PhysicalLine[] {
  return context.revision.lines.filter(
    (line) =>
      line.span.start >= block.value.content.start && line.span.end <= block.value.content.end,
  );
}

function isSourceLine(line: PhysicalLine, options: ManagedPluginOptions): boolean {
  return (
    (options.sourceLinePrefix !== undefined &&
      line.text.trim().startsWith(options.sourceLinePrefix)) ||
    (options.sourceLine !== undefined && line.text === options.sourceLine)
  );
}

function missingLines(
  context: PassContext,
  options: ManagedPluginOptions,
  block: ObservedBlock,
): readonly string[] {
  const existing = new Set(
    contentLines(context, block)
      .filter((line) => !isSourceLine(line, options))
      .map((line) => line.text),
  );
  return [
    ...new Set(options.block.content.split(/\r\n|\r|\n/).filter((line) => line.length > 0)),
  ].filter((line) => !existing.has(line));
}

function additiveOffset(
  context: PassContext,
  options: ManagedPluginOptions,
  block: ObservedBlock,
): number {
  const lines = contentLines(context, block).filter((line) => !isSourceLine(line, options));
  const sourceLines = contentLines(context, block).filter((line) => isSourceLine(line, options));
  const policy = options.additive!;
  const before = policy.before;
  const after = policy.after;
  if (before === "BOF") {
    return lines[0]?.span.start ?? sourceLines.at(-1)?.span.end ?? block.value.content.start;
  }
  if (before instanceof RegExp) {
    return (
      lines.find((line) => matches(before, line.text))?.span.start ??
      lines[0]?.span.start ??
      sourceLines.at(-1)?.span.end ??
      block.value.content.start
    );
  }
  if (after instanceof RegExp) {
    return lines.find((line) => matches(after, line.text))?.span.end ?? block.value.content.end;
  }
  return block.value.content.end;
}

function emitAdditivePlan(
  context: PassContext,
  options: ManagedPluginOptions,
  block: ObservedBlock,
): void {
  const lines = contentLines(context, block);
  const attribution = lines.find((line) => isSourceLine(line, options));
  const metadataEnd = attribution?.span.end ?? block.value.opener.span.end;
  const terminator = block.value.opener.terminator;
  const metadata = `${outputOpener(options, parseTags(block.value.opener.text))}${terminator}${
    options.sourceLine ? `${options.sourceLine}${terminator}` : ""
  }`;
  let changed = false;
  if (context.revision.text.slice(block.value.opener.span.start, metadataEnd) !== metadata) {
    context.emit.edit({
      range: checkedSpan(context.revision, {
        start: block.value.opener.span.start,
        end: metadataEnd,
      })!,
      replacement: metadata,
      reason: "update managed block metadata",
      evidence: [block.fact.id],
      rule: "additive-metadata",
    });
    changed = true;
  }

  const missing = missingLines(context, options, block);
  if (missing.length > 0) {
    const terminator = inheritedTerminator(context.revision.lines);
    context.emit.edit({
      range: checkedSpan(context.revision, {
        start: additiveOffset(context, options, block),
        end: additiveOffset(context, options, block),
      })!,
      replacement: `${missing.join(terminator)}${terminator}`,
      reason: "add missing managed block lines",
      evidence: [block.fact.id],
      rule: "additive",
    });
    changed = true;
  }
  emitOutcome(context, changed ? "updated" : "kept");
}

function emitPresentPlan(
  context: PassContext,
  options: ManagedPluginOptions,
  block: ObservedBlock,
): void {
  const { dialect, content } = options.block;
  if (options.whenPresent.kind === "error") {
    context.emit.diagnostic({
      code: "managed-block-present",
      message: "A managed block is already present",
      subject: block.value.envelope,
      rule: "present-policy",
    });
    emitOutcome(context, "skipped");
    return;
  }
  if (options.whenPresent.kind === "keep") {
    emitOutcome(context, "kept");
    return;
  }
  if (options.whenPresent.kind === "remove") {
    context.emit.edit({
      range: checkedSpan(context.revision, block.value.envelope)!,
      replacement: "",
      reason: "remove managed block",
      evidence: [block.fact.id],
      rule: "remove",
    });
    emitOutcome(context, "removed");
    return;
  }
  if (options.additive) {
    emitAdditivePlan(context, options, block);
    return;
  }

  const replacement = render(
    dialect,
    content,
    inheritedTerminator(context.revision.lines),
    block.value.closer.terminator,
    outputOpener(options, parseTags(block.value.opener.text)),
    options.sourceLine,
  );
  if (
    context.revision.text.slice(block.value.envelope.start, block.value.envelope.end) ===
    replacement
  ) {
    emitOutcome(context, "kept");
    return;
  }
  context.emit.edit({
    range: checkedSpan(context.revision, block.value.envelope)!,
    replacement,
    reason: "update managed block",
    evidence: [block.fact.id],
    rule: "update",
  });
  emitOutcome(context, "updated");
}

function emitMissingPlan(context: PassContext, options: ManagedPluginOptions): void {
  const missing = options.whenMissing;
  if (missing.kind === "skip" || missing.kind === "error") {
    if (missing.kind === "error") {
      context.emit.diagnostic({
        code: "managed-block-absent",
        message: "No managed block was found",
        rule: "missing-policy",
      });
    }
    emitOutcome(context, "skipped");
    return;
  }
  if (missing.kind === "insert") {
    const placement =
      options.anchor && missing.placement.kind !== "line-match"
        ? resolveManagedAnchorPlacement(
            context.revision,
            options.anchor,
            observedAnchors(context).map((anchor) => anchor.value),
          )
        : resolvePlacement(context.revision, missing.placement);
    if (typeof placement !== "number") {
      context.emit.diagnostic({
        code: placement.code,
        message: `Could not place managed block: ${placement.code}`,
        rule: "placement",
      });
      emitOutcome(context, "skipped");
      return;
    }
    context.emit.edit({
      range: checkedSpan(context.revision, { start: placement, end: placement })!,
      replacement: insertionText(context, placement, options),
      reason: "insert managed block",
      rule: "insert",
    });
    emitOutcome(context, "inserted");
    return;
  }

  if (missing.kind !== "take-over") {
    return;
  }
  const { span, mode } = missing;
  const lineAligned =
    context.revision.lines.some((line) => line.span.start === span.start) &&
    context.revision.lines.some((line) => line.span.end === span.end);
  if (!lineAligned) {
    context.emit.diagnostic({
      code: "managed-take-over-not-line-aligned",
      message: "Managed take-over requires a whole-line source span",
      subject: span,
      rule: "take-over",
    });
    emitOutcome(context, "skipped");
    return;
  }
  const trailing =
    context.revision.lines.find((line) => line.span.end === span.end)?.terminator ?? "";
  context.emit.edit({
    range: span,
    replacement: render(
      options.block.dialect,
      mode === "adopt" ? span.expected : options.block.content,
      inheritedTerminator(context.revision.lines),
      trailing,
      outputOpener(options),
      options.sourceLine,
    ),
    reason: "take over managed block",
    rule: "take-over",
  });
  emitOutcome(context, mode === "adopt" ? "adopted" : "replaced");
}

/** Create a built-in managed-block plugin over retained source revisions. */
export function managedPlugin(options: ManagedPluginOptions): ReconciliationPlugin {
  if (options.additive?.before && options.additive.after) {
    throw new Error("Managed additive policy cannot specify both before and after placement");
  }
  const manifest =
    options.manifest ??
    ({ id: "block-in-file/managed", version: "2", title: "Managed blocks" } as const);
  const scanner: SnapshotLinePass<ScanState> = {
    descriptor: { id: "marker-scan", title: "Scan managed block markers" },
    initial() {
      return { blockCount: 0, invalid: false };
    },
    line(state, line, context) {
      const opener =
        normalize(options.block.dialect, stripTagsForMatching(line.text)) ===
        normalize(options.block.dialect, options.block.dialect.opener);
      const closer =
        normalize(options.block.dialect, stripTagsForMatching(line.text)) ===
        normalize(options.block.dialect, options.block.dialect.closer);
      if (opener) {
        if (state.opener) {
          context.emit.diagnostic({
            code: "nested-marker",
            message: `Nested managed-block opener at line ${line.number}`,
            subject: line.span,
            rule: "structure",
          });
          return { ...state, invalid: true };
        }
        return { ...state, opener: line };
      }
      if (!closer) {
        return state;
      }
      if (!state.opener) {
        context.emit.diagnostic({
          code: "orphan-closer",
          message: `Orphan managed-block closer at line ${line.number}`,
          subject: line.span,
          rule: "structure",
        });
        return { ...state, invalid: true };
      }
      const envelope = sourceSpan(context.revision, {
        start: state.opener.span.start,
        end: line.span.end,
      })!;
      context.emit.fact({
        kind: "managed.block",
        subject: envelope,
        value: {
          opener: state.opener,
          closer: line,
          content: checkedSpan(context.revision, {
            start: state.opener.span.end,
            end: line.span.start,
          })!,
          envelope,
        },
        rule: "marker-envelope",
      });
      return { blockCount: state.blockCount + 1, invalid: state.invalid };
    },
    finish(state, context) {
      let invalid = state.invalid;
      if (state.opener) {
        context.emit.diagnostic({
          code: "orphan-opener",
          message: `Orphan managed-block opener at line ${state.opener.number}`,
          subject: state.opener.span,
          rule: "structure",
        });
        invalid = true;
      }
      if (state.blockCount > 1) {
        context.emit.diagnostic({
          code: "duplicate-block",
          message: "Multiple matching managed blocks were found",
          rule: "structure",
        });
        invalid = true;
      }
      for (const anchor of inspectManagedAnchors(context.revision, options.block.dialect)) {
        context.emit.fact({
          kind: "managed.anchor",
          subject: anchor.span,
          value: anchor,
          rule: "anchor-scan",
        });
      }
      context.emit.fact({
        kind: "managed.integrity",
        value: { valid: !invalid, blockCount: state.blockCount },
        rule: "structure",
      });
    },
  };
  const planner: ReconciliationPass = {
    descriptor: {
      id: "ownership-plan",
      title: "Plan managed block ownership",
      after: [{ plugin: manifest.id, pass: scanner.descriptor.id }],
    },
    run(context) {
      const integrity = context.facts
        .kind("managed.integrity")
        .find((fact) => isIntegrity(fact.value));
      if (!integrity || !isIntegrity(integrity.value) || !integrity.value.valid) {
        emitOutcome(context, "skipped");
        return;
      }
      const blocks = observedBlocks(context);
      if (blocks.length === 1) {
        emitPresentPlan(context, options, blocks[0]!);
      } else {
        emitMissingPlan(context, options);
      }
    },
  };
  return Object.freeze({
    manifest,
    passes: Object.freeze([adaptLinePass(scanner), Object.freeze(planner)]),
  });
}
