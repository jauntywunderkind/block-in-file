import type { RevisionId } from "./revision.ts";
import type { SourceSpan } from "./spans.ts";

/** The exact terminator retained after one physical line, or empty at EOF. */
export type LineTerminator = "\n" | "\r\n" | "\r" | "";

/** An exact, revision-bound partition of a retained JavaScript string. */
export type PhysicalLine = Readonly<{
  number: number;
  text: string;
  span: SourceSpan;
  terminator: LineTerminator;
}>;

/** Index physical lines without splitting or reassembling retained source. */
export function indexPhysicalLines(text: string, revision: RevisionId): readonly PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  let number = 1;

  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code !== 10 && code !== 13) {
      continue;
    }

    const terminator =
      code === 13 && text.charCodeAt(index + 1) === 10 ? "\r\n" : code === 13 ? "\r" : "\n";
    const end = index + terminator.length;
    lines.push({
      number,
      text: text.slice(start, index),
      span: { revision, start, end },
      terminator,
    });
    number++;
    start = end;
    index = end - 1;
  }

  if (start < text.length) {
    lines.push({
      number,
      text: text.slice(start),
      span: { revision, start, end: text.length },
      terminator: "",
    });
  }

  return lines;
}

/** Choose the first existing terminator, defaulting to LF for generated content. */
export function inheritedTerminator(lines: readonly PhysicalLine[]): Exclude<LineTerminator, ""> {
  for (const line of lines) {
    if (line.terminator !== "") {
      return line.terminator;
    }
  }
  return "\n";
}
