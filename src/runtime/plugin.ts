import type { SourceRevision } from "../source/revision.ts";
import type { DiagnosticInput, Fact, FactInput } from "./facts.ts";
import type { EditId, FactId, PlanId, PluginIdentity } from "./origin.ts";
import type { EditInput, PlanDescriptor } from "./plans.ts";

/** Stable address of one pass, independent of JavaScript object identity. */
export type PassReference = Readonly<{
  plugin: string;
  pass: string;
}>;

/** Stable display and dependency metadata for one plugin pass. */
export type PassDescriptor = Readonly<{
  id: string;
  title: string;
  after?: readonly PassReference[];
}>;

/** Read-only, scheduler-authorized view of revision-bound facts. */
export type FactQuery = Readonly<{
  all(): readonly Fact[];
  kind(kind: string): readonly Fact[];
}>;

/** Capability-limited emitter for facts, diagnostics, plans, and edit intents. */
export type PassEmitter = Readonly<{
  declarePlan(descriptor: PlanDescriptor): PlanId;
  fact(input: FactInput): FactId;
  diagnostic(input: DiagnosticInput): void;
  edit(input: EditInput): EditId;
}>;

/** The pure capability set supplied to one plugin pass invocation. */
export type PassContext = Readonly<{
  revision: SourceRevision;
  facts: FactQuery;
  emit: PassEmitter;
}>;

/** One synchronous pure reconciliation pass supplied by a plugin. */
export type ReconciliationPass = Readonly<{
  descriptor: PassDescriptor;
  run(context: PassContext): void;
}>;

/** A pure package of reconciliation passes; loading and configuration belong to the host. */
export type ReconciliationPlugin = Readonly<{
  manifest: PluginIdentity & Readonly<{ title: string }>;
  passes: readonly ReconciliationPass[];
}>;
