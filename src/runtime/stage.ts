import type { SourceRevision } from "../source/revision.ts";
import { isSourceSpan, type SourceSpan } from "../source/spans.ts";
import type { DiagnosticInput, Fact, FactBatch, FactInput, StageDiagnostic } from "./facts.ts";
import {
  beginOrigin,
  createEditId,
  createFactId,
  createPlanId,
  withRule,
  type EditId,
  type FactId,
  type Origin,
  type PassIdentity,
  type PlanId,
} from "./origin.ts";
import type { EditInput, EditIntent, PlanDescriptor, PlanReport, PlanSet } from "./plans.ts";

/** One immutable snapshot of a pass's emitted facts, diagnostics, and named plans. */
export type StageReport = FactBatch &
  Readonly<{
    origin: Origin;
    plans: PlanSet;
  }>;

/** Runtime-owned collector exposed to one synchronous pass invocation. */
export type StageCollector = Readonly<{
  origin: Origin;
  facts(): readonly Fact[];
  declarePlan(descriptor: PlanDescriptor): PlanId;
  fact(input: FactInput): FactId;
  diagnostic(input: DiagnosticInput): void;
  edit(input: EditInput): EditId;
  report(): StageReport;
}>;

type MutablePlan = {
  id: PlanId;
  descriptor: PlanDescriptor;
  edits: EditIntent[];
};

function requireCurrentSpan(revision: SourceRevision, span: SourceSpan): void {
  if (!isSourceSpan(span, revision)) {
    throw new RangeError("Stage emissions must target the active source revision");
  }
}

/**
 * Begin one pure stage for a pass invocation.
 *
 * Incoming facts must already belong to this revision. The collector assigns fresh
 * fact, edit, plan, and invocation identities; callers can supply only stable
 * pass identity and optional rule names.
 */
export function beginStage(
  revision: SourceRevision,
  identity: PassIdentity,
  incomingFacts: readonly Fact[] = [],
): StageCollector {
  const origin = beginOrigin(identity);
  const knownFacts = new Map<FactId, Fact>();
  for (const fact of incomingFacts) {
    if (fact.revision !== revision.id || (fact.subject && !isSourceSpan(fact.subject, revision))) {
      throw new RangeError("Incoming facts must belong to the active source revision");
    }
    knownFacts.set(fact.id, fact);
  }

  const emittedFacts: Fact[] = [];
  const diagnostics: StageDiagnostic[] = [];
  const plans = new Map<string, MutablePlan>();
  const defaultPlan: MutablePlan = {
    id: createPlanId(),
    descriptor: Object.freeze({ name: "default", title: "Default plan" }),
    edits: [],
  };
  plans.set(defaultPlan.descriptor.name, defaultPlan);

  function fact(input: FactInput): FactId {
    if (input.subject) {
      requireCurrentSpan(revision, input.subject);
    }
    const record = Object.freeze({
      id: createFactId(),
      revision: revision.id,
      kind: input.kind,
      subject: input.subject,
      value: input.value,
      origin: withRule(origin, input.rule),
    });
    knownFacts.set(record.id, record);
    emittedFacts.push(record);
    return record.id;
  }

  function diagnostic(input: DiagnosticInput): void {
    if (input.subject) {
      requireCurrentSpan(revision, input.subject);
    }
    diagnostics.push(
      Object.freeze({
        revision: revision.id,
        code: input.code,
        message: input.message,
        subject: input.subject,
        origin: withRule(origin, input.rule),
      }),
    );
  }

  function declarePlan(descriptor: PlanDescriptor): PlanId {
    if (plans.has(descriptor.name)) {
      throw new Error(`Plan '${descriptor.name}' is already declared`);
    }
    const plan = { id: createPlanId(), descriptor: Object.freeze({ ...descriptor }), edits: [] };
    plans.set(plan.descriptor.name, plan);
    return plan.id;
  }

  function edit(input: EditInput): EditId {
    requireCurrentSpan(revision, input.range);
    const plan = plans.get(input.plan ?? "default");
    if (!plan) {
      throw new Error(`Plan '${input.plan}' has not been declared`);
    }
    const evidence = input.evidence ?? [];
    for (const id of evidence) {
      if (!knownFacts.has(id)) {
        throw new Error(`Edit evidence '${id}' is not available to this stage`);
      }
    }
    const intent = Object.freeze({
      id: createEditId(),
      revision: revision.id,
      range: input.range,
      replacement: input.replacement,
      reason: input.reason,
      evidence: Object.freeze([...evidence]),
      origin: withRule(origin, input.rule),
    });
    plan.edits.push(intent);
    return intent.id;
  }

  function report(): StageReport {
    const reports: PlanReport[] = [...plans.values()].map((plan) =>
      Object.freeze({
        id: plan.id,
        descriptor: plan.descriptor,
        origin,
        revision: revision.id,
        edits: Object.freeze([...plan.edits]),
      }),
    );
    return Object.freeze({
      revision: revision.id,
      origin,
      facts: Object.freeze([...emittedFacts]),
      diagnostics: Object.freeze([...diagnostics]),
      plans: Object.freeze({ revision: revision.id, plans: Object.freeze(reports) }),
    });
  }

  return Object.freeze({
    origin,
    facts: () => Object.freeze([...knownFacts.values()]),
    declarePlan,
    fact,
    diagnostic,
    edit,
    report,
  });
}
