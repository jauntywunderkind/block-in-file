import type { PhysicalLine } from "../source/lines.ts";
import type { SourceDocument } from "./types.ts";

export type ContextTracker<State> = Readonly<{
  initial(): State;
  advance(state: State, line: PhysicalLine): State;
}>;

export type ContextualLine<State> = Readonly<{
  line: PhysicalLine;
  before: State;
  after: State;
}>;

export function walk<State>(
  document: SourceDocument,
  tracker: ContextTracker<State>,
): readonly ContextualLine<State>[] {
  let state = tracker.initial();
  return document.lines.map((line) => {
    const before = state;
    state = tracker.advance(state, line);
    return { line, before, after: state };
  });
}
