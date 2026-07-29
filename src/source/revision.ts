import { indexPhysicalLines, type PhysicalLine } from "./lines.ts";

declare const revisionBrand: unique symbol;

/** Opaque identity for one retained source snapshot within this runtime. */
export type RevisionId = string & { readonly [revisionBrand]: never };

/** An immutable source string and physical-line index forming one coordinate universe. */
export type SourceRevision = Readonly<{
  id: RevisionId;
  text: string;
  lines: readonly PhysicalLine[];
}>;

let nextRevisionId = 0;

/** Create a fresh coordinate universe even when the retained text is equal. */
export function createSourceRevision(text: string): SourceRevision {
  const id = `revision-${++nextRevisionId}` as RevisionId;
  const lines = indexPhysicalLines(text, id).map((line) =>
    Object.freeze({ ...line, span: Object.freeze({ ...line.span }) }),
  );
  return Object.freeze({
    id,
    text,
    lines: Object.freeze(lines),
  });
}
