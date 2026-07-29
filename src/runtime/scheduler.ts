import type { SourceRevision } from "../source/revision.ts";
import type { Fact, StageDiagnostic } from "./facts.ts";
import type { PluginIdentity } from "./origin.ts";
import type {
  PassContext,
  PassDescriptor,
  PassEmitter,
  FactQuery,
  ReconciliationPlugin,
} from "./plugin.ts";
import type { PassReference } from "./plugin.ts";
import type { PlanSet } from "./plans.ts";
import { beginStage, type StageReport } from "./stage.ts";

type RegisteredPass = Readonly<{
  address: PassReference;
  descriptor: PassDescriptor;
  plugin: PluginIdentity;
  run: (context: PassContext) => void;
  index: number;
}>;

/** A plugin identity occurred more than once in one scheduler input. */
export type DuplicatePluginFailure = Readonly<{
  code: "duplicate-plugin";
  plugin: string;
}>;

/** A plugin declared the same pass ID more than once. */
export type DuplicatePassFailure = Readonly<{
  code: "duplicate-pass";
  pass: PassReference;
}>;

/** A pass dependency did not resolve to a registered pass. */
export type UnknownPassReferenceFailure = Readonly<{
  code: "unknown-pass-reference";
  pass: PassReference;
  reference: PassReference;
}>;

/** Registered pass dependencies formed a cycle. */
export type PassCycleFailure = Readonly<{
  code: "pass-cycle";
  passes: readonly PassReference[];
}>;

/** Failures raised while validating a static plugin registry. */
export type SchedulerFailure =
  | DuplicatePluginFailure
  | DuplicatePassFailure
  | UnknownPassReferenceFailure
  | PassCycleFailure;

/** One fully ordered, immutable-revision plugin stage result. */
export type ScheduledStageReport = Readonly<{
  revision: SourceRevision;
  passes: readonly StageReport[];
  facts: readonly Fact[];
  diagnostics: readonly StageDiagnostic[];
  plans: PlanSet;
}>;

/** A validated, reusable pure plugin scheduler. */
export type ReconciliationScheduler = Readonly<{
  run(revision: SourceRevision): ScheduledStageReport;
}>;

function key(reference: PassReference): string {
  return JSON.stringify([reference.plugin, reference.pass]);
}

function factsFor(
  dependencies: readonly PassReference[],
  reports: ReadonlyMap<string, StageReport>,
): readonly Fact[] {
  const facts = new Map<string, Fact>();
  for (const dependency of dependencies) {
    for (const fact of reports.get(key(dependency))!.facts) {
      facts.set(fact.id, fact);
    }
  }
  return Object.freeze([...facts.values()]);
}

function query(facts: readonly Fact[]): FactQuery {
  return Object.freeze({
    all: () => facts,
    kind: (kind) => Object.freeze(facts.filter((fact) => fact.kind === kind)),
  });
}

function emitter(stage: ReturnType<typeof beginStage>): PassEmitter {
  return Object.freeze({
    declarePlan: stage.declarePlan,
    fact: stage.fact,
    diagnostic: stage.diagnostic,
    edit: stage.edit,
  });
}

function register(
  plugins: readonly ReconciliationPlugin[],
): readonly RegisteredPass[] | SchedulerFailure {
  const pluginIds = new Set<string>();
  const passes = new Map<string, RegisteredPass>();
  let index = 0;

  for (const plugin of plugins) {
    if (pluginIds.has(plugin.manifest.id)) {
      return { code: "duplicate-plugin", plugin: plugin.manifest.id };
    }
    pluginIds.add(plugin.manifest.id);
    const identity = Object.freeze({ id: plugin.manifest.id, version: plugin.manifest.version });
    for (const pass of plugin.passes) {
      const address = Object.freeze({ plugin: identity.id, pass: pass.descriptor.id });
      const passKey = key(address);
      if (passes.has(passKey)) {
        return { code: "duplicate-pass", pass: address };
      }
      const descriptor = pass.descriptor.after
        ? Object.freeze({
            ...pass.descriptor,
            after: Object.freeze(
              pass.descriptor.after.map((reference) => Object.freeze({ ...reference })),
            ),
          })
        : Object.freeze({ ...pass.descriptor });
      passes.set(
        passKey,
        Object.freeze({ address, descriptor, plugin: identity, run: pass.run, index: index++ }),
      );
    }
  }

  for (const pass of passes.values()) {
    for (const reference of pass.descriptor.after ?? []) {
      if (!passes.has(key(reference))) {
        return { code: "unknown-pass-reference", pass: pass.address, reference };
      }
    }
  }
  return [...passes.values()];
}

function order(passes: readonly RegisteredPass[]): readonly RegisteredPass[] | PassCycleFailure {
  const remaining = new Map(passes.map((pass) => [key(pass.address), pass]));
  const ordered: RegisteredPass[] = [];
  const completed = new Set<string>();

  while (remaining.size > 0) {
    const next = [...remaining.values()]
      .filter((pass) =>
        (pass.descriptor.after ?? []).every((reference) => completed.has(key(reference))),
      )
      .sort((left, right) => left.index - right.index)[0];
    if (!next) {
      return {
        code: "pass-cycle",
        passes: Object.freeze([...remaining.values()].map((pass) => pass.address)),
      };
    }
    ordered.push(next);
    remaining.delete(key(next.address));
    completed.add(key(next.address));
  }
  return Object.freeze(ordered);
}

/** Return whether registry construction failed rather than producing a scheduler. */
export function isSchedulerFailure(
  value: ReconciliationScheduler | SchedulerFailure,
): value is SchedulerFailure {
  return "code" in value;
}

/**
 * Validate plugins once and create a reusable scheduler for immutable source stages.
 *
 * Passes run in deterministic topological order. A pass receives facts emitted by
 * its direct `after` dependencies only; no source edits become visible until a host
 * explicitly applies selected plans and starts another stage on the next revision.
 */
export function createScheduler(
  plugins: readonly ReconciliationPlugin[],
): ReconciliationScheduler | SchedulerFailure {
  const registered = register(plugins);
  if ("code" in registered) {
    return registered;
  }
  const ordered = order(registered);
  if ("code" in ordered) {
    return ordered;
  }

  return Object.freeze({
    run(revision) {
      const reports = new Map<string, StageReport>();
      const stages: StageReport[] = [];
      for (const pass of ordered) {
        const stage = beginStage(
          revision,
          {
            plugin: pass.plugin,
            pass: pass.descriptor.id,
          },
          factsFor(pass.descriptor.after ?? [], reports),
        );
        pass.run({ revision, facts: query(stage.facts()), emit: emitter(stage) });
        const report = stage.report();
        reports.set(key(pass.address), report);
        stages.push(report);
      }

      const facts = Object.freeze(stages.flatMap((stage) => stage.facts));
      const diagnostics = Object.freeze(stages.flatMap((stage) => stage.diagnostics));
      const plans = Object.freeze({
        revision: revision.id,
        plans: Object.freeze(stages.flatMap((stage) => stage.plans.plans)),
      });
      return Object.freeze({ revision, passes: Object.freeze(stages), facts, diagnostics, plans });
    },
  });
}
