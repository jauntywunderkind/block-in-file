import type { Document } from "../document/types.ts";
import { apply, isApplyFailure, replace } from "../reconcile/apply.ts";
import { resolvePlacement, type Placement, type PlacementFailure } from "../reconcile/placement.ts";
import type { ApplyFailure, Change, EditPlan } from "../reconcile/plan.ts";
import type { CheckedSpan } from "../source/spans.ts";
import {
  documentTerminator,
  inspectManagedBlocks,
  renderManagedBlock,
  type ManagedBlock,
  type MarkerDialect,
} from "./markers.ts";

export type BlockRequest = Readonly<{
  block: Readonly<{ dialect: MarkerDialect; content: string }>;
  whenPresent: Readonly<{ kind: "update" | "keep" | "remove" | "error" }>;
  whenMissing:
    | Readonly<{ kind: "insert"; placement: Placement }>
    | Readonly<{ kind: "take-over"; span: CheckedSpan; mode: "adopt" | "replace" }>
    | Readonly<{ kind: "skip" | "error" }>;
}>;

export type ManagedOutcome =
  | "updated"
  | "inserted"
  | "adopted"
  | "replaced"
  | "removed"
  | "kept"
  | "skipped";

export type ManagedChange = Change &
  Readonly<{
    outcome: ManagedOutcome;
    block: ManagedBlock | undefined;
  }>;

export type ManagedFailure =
  | ApplyFailure
  | PlacementFailure
  | Readonly<{ code: "marker-integrity"; diagnostics: readonly string[] }>
  | Readonly<{ code: "managed-block-ambiguous"; blocks: readonly ManagedBlock[] }>
  | Readonly<{ code: "managed-block-present" }>
  | Readonly<{ code: "managed-block-absent" }>
  | Readonly<{ code: "managed-take-over-not-line-aligned"; span: CheckedSpan }>;

export type ManagedPlan = Readonly<{
  plan: EditPlan;
  outcome: ManagedOutcome;
  block: ManagedBlock | undefined;
}>;

function isPlacementFailure(value: number | PlacementFailure): value is PlacementFailure {
  return typeof value !== "number";
}

function isLineAligned(document: Document<unknown>, span: CheckedSpan): boolean {
  return (
    document.lines.some((line) => line.span.start === span.start) &&
    document.lines.some((line) => line.span.end === span.end)
  );
}

function insertionText(
  document: Document<unknown>,
  at: number,
  content: string,
  dialect: MarkerDialect,
): string {
  const terminator = documentTerminator(document);
  const before = document.text.slice(0, at);
  const after = document.text.slice(at);
  const prefix = before.length > 0 && !/[\r\n]$/.test(before) ? terminator : "";
  const suffix = after.length > 0 ? terminator : "";
  return `${prefix}${renderManagedBlock(dialect, content, terminator)}${suffix}`;
}

export function planBlock(
  document: Document<unknown>,
  request: BlockRequest,
): ManagedPlan | ManagedFailure {
  const inspection = inspectManagedBlocks(document, request.block.dialect);
  if (inspection.diagnostics.length > 0) {
    return {
      code: "marker-integrity",
      diagnostics: inspection.diagnostics.map((diagnostic) => diagnostic.message),
    };
  }
  if (inspection.blocks.length > 1) {
    return { code: "managed-block-ambiguous", blocks: inspection.blocks };
  }

  const block = inspection.blocks[0];
  if (block) {
    if (request.whenPresent.kind === "error") {
      return { code: "managed-block-present" };
    }
    if (request.whenPresent.kind === "keep") {
      return { plan: { source: document.text, edits: [] }, outcome: "kept", block };
    }
    if (request.whenPresent.kind === "remove") {
      return {
        plan: {
          source: document.text,
          edits: [
            replace(
              { ...block.span, expected: document.text.slice(block.span.start, block.span.end) },
              "",
              "remove managed block",
            ),
          ],
        },
        outcome: "removed",
        block,
      };
    }
    return {
      plan: {
        source: document.text,
        edits: [
          replace(
            { ...block.span, expected: document.text.slice(block.span.start, block.span.end) },
            renderManagedBlock(
              request.block.dialect,
              request.block.content,
              documentTerminator(document),
              block.closer.terminator,
            ),
            "update managed block",
          ),
        ],
      },
      outcome: "updated",
      block,
    };
  }

  if (request.whenMissing.kind === "skip") {
    return { plan: { source: document.text, edits: [] }, outcome: "skipped", block: undefined };
  }
  if (request.whenMissing.kind === "error") {
    return { code: "managed-block-absent" };
  }
  if (request.whenMissing.kind === "insert") {
    const at = resolvePlacement(document, request.whenMissing.placement);
    if (isPlacementFailure(at)) {
      return at;
    }
    return {
      plan: {
        source: document.text,
        edits: [
          replace(
            { start: at, end: at, expected: "" },
            insertionText(document, at, request.block.content, request.block.dialect),
            "insert managed block",
          ),
        ],
      },
      outcome: "inserted",
      block: undefined,
    };
  }

  if (request.whenMissing.kind !== "take-over") {
    return { code: "managed-block-absent" };
  }
  const { span, mode } = request.whenMissing;
  if (!isLineAligned(document, span)) {
    return { code: "managed-take-over-not-line-aligned", span };
  }
  return {
    plan: {
      source: document.text,
      edits: [
        replace(
          span,
          renderManagedBlock(
            request.block.dialect,
            mode === "adopt" ? span.expected : request.block.content,
            documentTerminator(document),
            document.lines.find((line) => line.span.end === span.end)?.terminator ?? "",
          ),
          "take over managed block",
        ),
      ],
    },
    outcome: mode === "adopt" ? "adopted" : "replaced",
    block: undefined,
  };
}

export function reconcileBlock(
  document: Document<unknown>,
  request: BlockRequest,
): ManagedChange | ManagedFailure {
  const planned = planBlock(document, request);
  if (!("plan" in planned)) {
    return planned;
  }
  const change = apply(planned.plan);
  if (isApplyFailure(change)) {
    return change;
  }
  return { ...change, outcome: planned.outcome, block: planned.block };
}
