import type { Document } from "../document/types.ts";
import { isSourceSpan } from "../source/spans.ts";

export type Placement =
  | Readonly<{ kind: "offset"; at: number }>
  | Readonly<{ kind: "edge"; edge: "BOF" | "EOF" }>
  | Readonly<{
      kind: "line-match";
      pattern: RegExp;
      relation: "before" | "after";
      cardinality: "unique-or-error";
    }>;

export type PlacementFailure =
  | Readonly<{ code: "placement-out-of-bounds"; at: number }>
  | Readonly<{ code: "placement-absent"; pattern: RegExp }>
  | Readonly<{ code: "placement-ambiguous"; pattern: RegExp; offsets: readonly number[] }>;

function matches(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

export function resolvePlacement(
  document: Document<unknown>,
  placement: Placement,
): number | PlacementFailure {
  if (placement.kind === "offset") {
    return isSourceSpan({ start: placement.at, end: placement.at }, document.text.length)
      ? placement.at
      : { code: "placement-out-of-bounds", at: placement.at };
  }
  if (placement.kind === "edge") {
    return placement.edge === "BOF" ? 0 : document.text.length;
  }

  const matchingLines = document.lines.filter((line) => matches(placement.pattern, line.text));
  if (matchingLines.length === 0) {
    return { code: "placement-absent", pattern: placement.pattern };
  }
  if (matchingLines.length > 1) {
    return {
      code: "placement-ambiguous",
      pattern: placement.pattern,
      offsets: matchingLines.map((line) => line.span.start),
    };
  }
  const line = matchingLines[0]!;
  return placement.relation === "before" ? line.span.start : line.span.end;
}
