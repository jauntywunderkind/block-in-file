import type { PhysicalLine } from "../source/lines.ts";

export type InspectDiagnostic = Readonly<{
  code: string;
  message: string;
}>;

export type SourceDocument = Readonly<{
  text: string;
  lines: readonly PhysicalLine[];
}>;

export type Document<Fact = never> = SourceDocument &
  Readonly<{
    facts: readonly Fact[];
    diagnostics: readonly InspectDiagnostic[];
  }>;

export type InspectionResult<Fact> = Readonly<{
  facts?: readonly Fact[];
  diagnostics?: readonly InspectDiagnostic[];
}>;

export type Inspector<Fact> = (document: SourceDocument) => InspectionResult<Fact>;

export type InspectionAssembly<Fact = never> = Readonly<{
  inspectors?: readonly Inspector<Fact>[];
}>;
