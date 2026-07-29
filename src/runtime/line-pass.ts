import type { PhysicalLine } from "../source/lines.ts";
import type { PassContext, PassDescriptor, ReconciliationPass } from "./plugin.ts";

/** A stateful physical-line fold that always finishes against one immutable revision. */
export type SnapshotLinePass<State> = Readonly<{
  descriptor: PassDescriptor;
  initial(context: PassContext): State;
  line(state: State, line: PhysicalLine, context: PassContext): State;
  finish(state: State, context: PassContext): void;
}>;

/**
 * Adapt a line fold into an ordinary reconciliation pass.
 *
 * Every callback observes the same immutable revision. Emitted edits are only
 * collected; they cannot alter later physical lines in the current invocation.
 * `finish` runs exactly once, including for an empty source revision.
 */
export function adaptLinePass<State>(pass: SnapshotLinePass<State>): ReconciliationPass {
  return Object.freeze({
    descriptor: pass.descriptor,
    run(context) {
      let state = pass.initial(context);
      for (const line of context.revision.lines) {
        state = pass.line(state, line, context);
      }
      pass.finish(state, context);
    },
  });
}
