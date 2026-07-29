declare const factIdBrand: unique symbol;
declare const editIdBrand: unique symbol;
declare const planIdBrand: unique symbol;

/** Stable identity of the plugin that owns a pass. */
export type PluginIdentity = Readonly<{
  id: string;
  version: string;
}>;

/** Stable pass identity supplied when the runtime starts one stage. */
export type PassIdentity = Readonly<{
  plugin: PluginIdentity;
  pass: string;
}>;

/** Runtime-stamped provenance attached to every stage emission. */
export type Origin = PassIdentity &
  Readonly<{
    rule?: string;
    invocation: string;
  }>;

/** Opaque runtime identity for one observed fact. */
export type FactId = string & { readonly [factIdBrand]: never };

/** Opaque runtime identity for one attributed edit intent. */
export type EditId = string & { readonly [editIdBrand]: never };

/** Opaque runtime identity for one named plan. */
export type PlanId = string & { readonly [planIdBrand]: never };

let nextInvocationId = 0;
let nextFactId = 0;
let nextEditId = 0;
let nextPlanId = 0;

/** Start one runtime-owned provenance scope for a pass invocation. */
export function beginOrigin(identity: PassIdentity): Origin {
  return Object.freeze({ ...identity, invocation: `invocation-${++nextInvocationId}` });
}

/** Attach an optional stable subrule without allowing a caller to change its invocation. */
export function withRule(origin: Origin, rule: string | undefined): Origin {
  return rule === undefined ? origin : Object.freeze({ ...origin, rule });
}

export function createFactId(): FactId {
  return `fact-${++nextFactId}` as FactId;
}

export function createEditId(): EditId {
  return `edit-${++nextEditId}` as EditId;
}

export function createPlanId(): PlanId {
  return `plan-${++nextPlanId}` as PlanId;
}
