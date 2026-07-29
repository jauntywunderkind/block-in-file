import { createSourceRevision } from "../source/revision.ts";
import type { SourceRevision } from "../source/revision.ts";
import type { Document, InspectionAssembly, InspectDiagnostic } from "./types.ts";

/** Create and inspect a fresh immutable source revision from text. */
export function inspect<Fact = never>(
  text: string,
  assembly: InspectionAssembly<Fact> = {},
): Document<Fact> {
  return inspectRevision(createSourceRevision(text), assembly);
}

/** Enrich an existing source revision without creating a different coordinate universe. */
export function inspectRevision<Fact = never>(
  source: SourceRevision,
  assembly: InspectionAssembly<Fact> = {},
): Document<Fact> {
  const facts: Fact[] = [];
  const diagnostics: InspectDiagnostic[] = [];

  for (const inspector of assembly.inspectors ?? []) {
    const result = inspector(source);
    facts.push(...(result.facts ?? []));
    diagnostics.push(...(result.diagnostics ?? []));
  }

  return Object.freeze({
    ...source,
    facts: Object.freeze(facts),
    diagnostics: Object.freeze(diagnostics),
  });
}
