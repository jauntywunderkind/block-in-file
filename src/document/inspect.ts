import { indexPhysicalLines } from "../source/lines.ts";
import type { Document, InspectionAssembly, InspectDiagnostic, SourceDocument } from "./types.ts";

export function inspect<Fact = never>(
  text: string,
  assembly: InspectionAssembly<Fact> = {},
): Document<Fact> {
  const source: SourceDocument = { text, lines: indexPhysicalLines(text) };
  const facts: Fact[] = [];
  const diagnostics: InspectDiagnostic[] = [];

  for (const inspector of assembly.inspectors ?? []) {
    const result = inspector(source);
    facts.push(...(result.facts ?? []));
    diagnostics.push(...(result.diagnostics ?? []));
  }

  return { ...source, facts, diagnostics };
}
