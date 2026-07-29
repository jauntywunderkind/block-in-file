export type SourceSpan = Readonly<{
  start: number;
  end: number;
}>;

export type CheckedSpan = Readonly<{
  start: number;
  end: number;
  expected: string;
}>;

export function isSourceSpan(value: SourceSpan, length: number): boolean {
  return (
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    value.start >= 0 &&
    value.start <= value.end &&
    value.end <= length
  );
}

export function checkedSpan(text: string, span: SourceSpan): CheckedSpan | undefined {
  if (!isSourceSpan(span, text.length)) {
    return undefined;
  }

  return { ...span, expected: text.slice(span.start, span.end) };
}
