import type { MarkerDialect } from "../../managed/markers.ts";
import { type SourceRevision } from "../../source/revision.ts";
import { sourceSpan, type SourceSpan } from "../../source/spans.ts";
import { parseTags, stripTagsForMatching, type Tag } from "../../tags/tags.ts";

/** A managed block's requested edge and ordering priority. */
export type ManagedAnchor = Readonly<{
  type: "bof" | "eof";
  priority: number;
}>;

/** A complete anchored marker envelope discovered in one source revision. */
export type ManagedAnchorObservation = Readonly<{
  anchor: ManagedAnchor;
  span: SourceSpan;
}>;

function markerTokens(dialect: MarkerDialect, text: string): readonly string[] {
  const normalized = (dialect.normalize ?? ((line) => line.trim()))(text).trim();
  return normalized.length === 0 ? [] : normalized.split(/\s+/);
}

function markerFamily(dialect: MarkerDialect, text: string, marker: "opener" | "closer"): boolean {
  const candidate = markerTokens(dialect, stripTagsForMatching(text));
  const reference = markerTokens(dialect, dialect[marker]);
  return (
    candidate.length >= 2 && candidate[0] === reference[0] && candidate.at(-1) === reference.at(-1)
  );
}

function parseAnchor(tags: readonly Tag[]): ManagedAnchor | undefined {
  for (const tag of tags) {
    const type = tag.name === "anchor-bof" ? "bof" : tag.name === "anchor-eof" ? "eof" : undefined;
    if (!type) {
      continue;
    }
    const priority = Number.parseInt(tag.value, 10);
    return { type, priority: Number.isNaN(priority) ? 100 : priority };
  }
  return undefined;
}

/** Scan complete managed marker families carrying anchor tags. */
export function inspectManagedAnchors(
  revision: SourceRevision,
  dialect: MarkerDialect,
): readonly ManagedAnchorObservation[] {
  const anchors: ManagedAnchorObservation[] = [];
  const openers: Array<Readonly<{ start: number; anchor?: ManagedAnchor }>> = [];
  for (const line of revision.lines) {
    if (markerFamily(dialect, line.text, "opener")) {
      openers.push({ start: line.span.start, anchor: parseAnchor(parseTags(line.text)) });
      continue;
    }
    if (!markerFamily(dialect, line.text, "closer")) {
      continue;
    }
    const opener = openers.pop();
    if (opener?.anchor) {
      anchors.push({
        anchor: opener.anchor,
        span: sourceSpan(revision, { start: opener.start, end: line.span.end })!,
      });
    }
  }
  return anchors;
}

/** Return the insertion offset that maintains stable managed-anchor priority order. */
export function resolveManagedAnchorPlacement(
  revision: SourceRevision,
  anchor: ManagedAnchor,
  observations: readonly ManagedAnchorObservation[],
): number {
  const anchored = observations.filter((observation) => observation.anchor.type === anchor.type);
  if (anchored.length === 0) {
    return anchor.type === "bof" ? 0 : revision.text.length;
  }
  if (anchor.type === "bof") {
    const lower = anchored
      .filter((observation) => observation.anchor.priority < anchor.priority)
      .sort(
        (left, right) =>
          right.anchor.priority - left.anchor.priority || left.span.start - right.span.start,
      )[0];
    if (lower) {
      return lower.span.start;
    }
    return anchored
      .filter((observation) => observation.anchor.priority >= anchor.priority)
      .sort(
        (left, right) =>
          left.anchor.priority - right.anchor.priority || left.span.start - right.span.start,
      )
      .at(-1)!.span.end;
  }
  const higher = anchored
    .filter((observation) => observation.anchor.priority > anchor.priority)
    .sort(
      (left, right) =>
        left.anchor.priority - right.anchor.priority || left.span.start - right.span.start,
    )[0];
  if (higher) {
    return higher.span.start;
  }
  return anchored
    .filter((observation) => observation.anchor.priority <= anchor.priority)
    .sort(
      (left, right) =>
        right.anchor.priority - left.anchor.priority || left.span.start - right.span.start,
    )
    .at(-1)!.span.end;
}
