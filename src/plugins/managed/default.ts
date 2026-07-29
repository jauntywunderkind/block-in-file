import { resolvePlacement } from "../../reconcile/placement.ts";
import { inheritedTerminator, type PhysicalLine } from "../../source/lines.ts";
import { checkedSpan, sourceSpan, type CheckedSpan, type SourceSpan } from "../../source/spans.ts";
import type { BlockRequest, ManagedOutcome } from "../../managed/default.ts";
import type { MarkerDialect } from "../../managed/markers.ts";
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

/** Configuration for the built-in managed-block reconciliation plugin. */
export type ManagedPluginOptions = BlockRequest &
  Readonly<{
    manifest?: PluginManifest;
  }>;

function normalize(dialect: MarkerDialect, text: string): string {
  return (dialect.normalize ?? ((line) => line.trim()))(text);
}

function render(
  dialect: MarkerDialect,
  content: string,
  terminator: string,
  trailing = "",
): string {
  const normalized = content.replace(/\r\n|\r|\n/g, terminator);
  const contentTerminator =
    normalized.length > 0 && !normalized.endsWith(terminator) ? terminator : "";
  return `${dialect.opener}${terminator}${normalized}${contentTerminator}${dialect.closer}${trailing}`;
}

function insertionText(
  context: PassContext,
  at: number,
  content: string,
  dialect: MarkerDialect,
): string {
  const terminator = inheritedTerminator(context.revision.lines);
  const before = context.revision.text.slice(0, at);
  const after = context.revision.text.slice(at);
  const prefix = before.length > 0 && !/[\r\n]$/.test(before) ? terminator : "";
  const suffix = after.length > 0 ? terminator : "";
  return `${prefix}${render(dialect, content, terminator)}${suffix}`;
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

  const replacement = render(
    dialect,
    content,
    inheritedTerminator(context.revision.lines),
    block.value.closer.terminator,
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
    const placement = resolvePlacement(context.revision, missing.placement);
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
      replacement: insertionText(context, placement, options.block.content, options.block.dialect),
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
    ),
    reason: "take over managed block",
    rule: "take-over",
  });
  emitOutcome(context, mode === "adopt" ? "adopted" : "replaced");
}

/** Create a built-in managed-block plugin over retained source revisions. */
export function managedPlugin(options: ManagedPluginOptions): ReconciliationPlugin {
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
        normalize(options.block.dialect, line.text) ===
        normalize(options.block.dialect, options.block.dialect.opener);
      const closer =
        normalize(options.block.dialect, line.text) ===
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
