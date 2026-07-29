import type { SourceRevision } from "../source/revision.ts";

export type InspectDiagnostic = Readonly<{
  code: string;
  message: string;
}>;

export type Document<Fact = never> = SourceRevision &
  Readonly<{
    facts: readonly Fact[];
    diagnostics: readonly InspectDiagnostic[];
  }>;

export type InspectionResult<Fact> = Readonly<{
  facts?: readonly Fact[];
  diagnostics?: readonly InspectDiagnostic[];
}>;

export type Inspector<Fact> = (document: SourceRevision) => InspectionResult<Fact>;

export type InspectionAssembly<Fact = never> = Readonly<{
  inspectors?: readonly Inspector<Fact>[];
}>;
