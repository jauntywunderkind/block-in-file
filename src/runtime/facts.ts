import type { RevisionId } from "../source/revision.ts";
import type { SourceSpan } from "../source/spans.ts";
import type { FactId, Origin } from "./origin.ts";

/** An origin-attributed observation about exactly one source revision. */
export type Fact<Kind extends string = string, Value = unknown> = Readonly<{
  id: FactId;
  revision: RevisionId;
  kind: Kind;
  subject?: SourceSpan;
  value: Value;
  origin: Origin;
}>;

/** Input accepted by a stage collector before it assigns identity and provenance. */
export type FactInput<Kind extends string = string, Value = unknown> = Readonly<{
  kind: Kind;
  subject?: SourceSpan;
  value: Value;
  rule?: string;
}>;

/** An origin-attributed diagnostic about exactly one source revision. */
export type StageDiagnostic = Readonly<{
  revision: RevisionId;
  code: string;
  message: string;
  subject?: SourceSpan;
  origin: Origin;
}>;

/** Input accepted by a stage collector before it assigns provenance. */
export type DiagnosticInput = Readonly<{
  code: string;
  message: string;
  subject?: SourceSpan;
  rule?: string;
}>;

/** Facts and diagnostics produced while inspecting one immutable revision. */
export type FactBatch = Readonly<{
  revision: RevisionId;
  facts: readonly Fact[];
  diagnostics: readonly StageDiagnostic[];
}>;
