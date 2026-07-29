import type { PhysicalLine } from "../source/lines.ts";
import type { SourceRevision } from "../source/revision.ts";

/** Stateful, source-preserving traversal behavior for physical lines. */
export type ContextTracker<State> = Readonly<{
  initial(): State;
  advance(state: State, line: PhysicalLine): State;
}>;

/** One physical line together with traversal state before and after it. */
export type ContextualLine<State> = Readonly<{
  line: PhysicalLine;
  before: State;
  after: State;
}>;

/** Walk every physical line without modifying the retained source revision. */
export function walk<State>(
  document: SourceRevision,
  tracker: ContextTracker<State>,
): readonly ContextualLine<State>[] {
  let state = tracker.initial();
  return document.lines.map((line) => {
    const before = state;
    state = tracker.advance(state, line);
    return { line, before, after: state };
  });
}
