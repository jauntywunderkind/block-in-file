import type { Document, InspectDiagnostic } from "../document/types.ts";
import { inheritedTerminator, type LineTerminator, type PhysicalLine } from "../source/lines.ts";
import type { CheckedSpan, SourceSpan } from "../source/spans.ts";

export type MarkerDialect = Readonly<{
  opener: string;
  closer: string;
  normalize?(line: string): string;
}>;

export type ManagedBlock = Readonly<{
  span: SourceSpan;
  content: CheckedSpan;
  opener: PhysicalLine;
  closer: PhysicalLine;
}>;

export type MarkerInspection = Readonly<{
  blocks: readonly ManagedBlock[];
  diagnostics: readonly InspectDiagnostic[];
}>;

function normalize(dialect: MarkerDialect, text: string): string {
  return (dialect.normalize ?? ((line) => line.trim()))(text);
}

export function inspectManagedBlocks(
  document: Document<unknown>,
  dialect: MarkerDialect,
): MarkerInspection {
  const blocks: ManagedBlock[] = [];
  const diagnostics: InspectDiagnostic[] = [];
  let opener: PhysicalLine | undefined;

  for (const line of document.lines) {
    const isOpener = normalize(dialect, line.text) === normalize(dialect, dialect.opener);
    const isCloser = normalize(dialect, line.text) === normalize(dialect, dialect.closer);

    if (isOpener) {
      if (opener) {
        diagnostics.push({
          code: "nested-marker",
          message: `Nested opener at line ${line.number}`,
        });
      } else {
        opener = line;
      }
      continue;
    }
    if (!isCloser) {
      continue;
    }
    if (!opener) {
      diagnostics.push({ code: "orphan-closer", message: `Orphan closer at line ${line.number}` });
      continue;
    }

    blocks.push({
      span: { start: opener.span.start, end: line.span.end },
      content: {
        start: opener.span.end,
        end: line.span.start,
        expected: document.text.slice(opener.span.end, line.span.start),
      },
      opener,
      closer: line,
    });
    opener = undefined;
  }

  if (opener) {
    diagnostics.push({ code: "orphan-opener", message: `Orphan opener at line ${opener.number}` });
  }
  if (blocks.length > 1) {
    diagnostics.push({ code: "duplicate-block", message: "Multiple matching managed blocks" });
  }

  return { blocks, diagnostics };
}

export function renderManagedBlock(
  dialect: MarkerDialect,
  content: string,
  terminator: Exclude<LineTerminator, "">,
  trailingTerminator = "",
): string {
  const normalizedContent = content.replace(/\r\n|\r|\n/g, terminator);
  const contentTerminator =
    normalizedContent.length > 0 && !normalizedContent.endsWith(terminator) ? terminator : "";
  return `${dialect.opener}${terminator}${normalizedContent}${contentTerminator}${dialect.closer}${trailingTerminator}`;
}

export function documentTerminator(document: Document<unknown>): Exclude<LineTerminator, ""> {
  return inheritedTerminator(document.lines);
}
