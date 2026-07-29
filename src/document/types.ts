import type { SourceRevision } from "../source/revision.ts";

/** A non-mutating observation made while inspecting retained source. */
export type InspectDiagnostic = Readonly<{
  code: string;
  message: string;
}>;

/** A retained revision enriched by synchronous inspection facts and diagnostics. */
export type Document<Fact = never> = SourceRevision &
  Readonly<{
    facts: readonly Fact[];
    diagnostics: readonly InspectDiagnostic[];
  }>;

/** Facts and diagnostics returned by one source inspector. */
export type InspectionResult<Fact> = Readonly<{
  facts?: readonly Fact[];
  diagnostics?: readonly InspectDiagnostic[];
}>;

/** A pure function that observes one retained revision without mutating it. */
export type Inspector<Fact> = (document: SourceRevision) => InspectionResult<Fact>;

/** The inspectors used to enrich a newly inspected source revision. */
export type InspectionAssembly<Fact = never> = Readonly<{
  inspectors?: readonly Inspector<Fact>[];
}>;
