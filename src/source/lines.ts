import type { SourceSpan } from "./spans.ts";

export type LineTerminator = "\n" | "\r\n" | "\r" | "";

export type PhysicalLine = Readonly<{
  number: number;
  text: string;
  span: SourceSpan;
  terminator: LineTerminator;
}>;

/** Index lines without splitting or reassembling the retained source. */
export function indexPhysicalLines(text: string): readonly PhysicalLine[] {
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
      span: { start, end },
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
      span: { start, end: text.length },
      terminator: "",
    });
  }

  return lines;
}

export function inheritedTerminator(lines: readonly PhysicalLine[]): Exclude<LineTerminator, ""> {
  for (const line of lines) {
    if (line.terminator !== "") {
      return line.terminator;
    }
  }
  return "\n";
}
