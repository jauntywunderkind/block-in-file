import { inheritedTerminator } from "../../source/lines.ts";
import { checkedSpan } from "../../source/spans.ts";
import { adaptLinePass, type SnapshotLinePass } from "../../runtime/line-pass.ts";
import type { Fact } from "../../runtime/facts.ts";
import type { PassContext, PluginManifest, ReconciliationPlugin } from "../../runtime/plugin.ts";

type Heading = Readonly<{
  fact: Fact;
  depth: number;
  text: string;
}>;

type PlannerState = Readonly<{
  target?: Heading;
  started: boolean;
  complete: boolean;
}>;

/** Configuration for the targeted, line-fold based Markdown changelog plugin. */
export type MarkdownChangelogPluginOptions = Readonly<{
  release: string;
  entry: string;
  manifest?: PluginManifest;
}>;

function parseHeading(text: string): Readonly<{ depth: number; text: string }> | undefined {
  const match = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(text);
  if (!match) {
    return undefined;
  }
  return { depth: match[1]!.length, text: match[2]! };
}

function subjectText(context: PassContext, fact: Fact): string | undefined {
  if (!fact.subject) {
    return undefined;
  }
  const source = context.revision.text.slice(fact.subject.start, fact.subject.end);
  if (source.endsWith("\r\n")) {
    return source.slice(0, -2);
  }
  if (source.endsWith("\n") || source.endsWith("\r")) {
    return source.slice(0, -1);
  }
  return source;
}

function headingFact(context: PassContext, fact: Fact): Heading | undefined {
  if (fact.kind !== "markdown.heading") {
    return undefined;
  }
  const heading = subjectText(context, fact);
  const parsed = heading && parseHeading(heading);
  return parsed ? { fact, ...parsed } : undefined;
}

function normalizeEntry(entry: string, terminator: string): string {
  return entry.replace(/\r\n|\r|\n/g, terminator);
}

function insertionText(context: PassContext, at: number, entry: string): string {
  const terminator = inheritedTerminator(context.revision.lines);
  const normalized = normalizeEntry(entry, terminator);
  const before = context.revision.text.slice(0, at);
  const prefix = before.length > 0 && !/[\r\n]$/.test(before) ? terminator : "";
  const suffix =
    at < context.revision.text.length && !normalized.endsWith(terminator) ? terminator : "";
  return `${prefix}${normalized}${suffix}`;
}

function planEntry(
  state: PlannerState,
  context: PassContext,
  entry: string,
  at: number,
): PlannerState {
  const target = state.target!;
  const body = context.revision.text.slice(target.fact.subject!.end, at);
  if (!body.includes(normalizeEntry(entry, inheritedTerminator(context.revision.lines)))) {
    context.emit.edit({
      plan: "changelog-entry",
      range: checkedSpan(context.revision, { start: at, end: at })!,
      replacement: insertionText(context, at, entry),
      reason: `add changelog entry under ${target.text}`,
      evidence: [target.fact.id],
      rule: "append-under-heading",
    });
  }
  return { ...state, complete: true };
}

/**
 * Create an experimental Markdown changelog plugin without a Markdown parser.
 *
 * It recognizes ATX headings only, finds one exact release heading, and inserts
 * the requested entry before the first blank or same-or-higher heading boundary.
 * The final fallback is EOF. All other Markdown is retained byte-for-code-unit.
 */
export function markdownChangelogPlugin(
  options: MarkdownChangelogPluginOptions,
): ReconciliationPlugin {
  if (options.release.trim().length === 0) {
    throw new Error("A changelog release heading is required");
  }
  if (options.entry.trim().length === 0) {
    throw new Error("A changelog entry is required");
  }

  const manifest =
    options.manifest ??
    ({
      id: "block-in-file/markdown-changelog",
      version: "0",
      title: "Markdown changelog",
    } as const);
  const scanner: SnapshotLinePass<undefined> = {
    descriptor: { id: "heading-scan", title: "Scan Markdown headings" },
    initial() {
      return undefined;
    },
    line(state, line, context) {
      const heading = parseHeading(line.text);
      if (heading) {
        context.emit.fact({
          kind: "markdown.heading",
          subject: line.span,
          value: heading,
          rule: "atx-heading",
        });
      }
      return state;
    },
    finish() {},
  };
  const planner: SnapshotLinePass<PlannerState> = {
    descriptor: {
      id: "entry-plan",
      title: "Plan changelog entry",
      after: [{ plugin: manifest.id, pass: scanner.descriptor.id }],
    },
    initial(context) {
      context.emit.declarePlan({
        name: "changelog-entry",
        title: "Add changelog entry",
        description: `Add an entry under ${options.release}.`,
      });
      const matches = context.facts.kind("markdown.heading").flatMap((fact) => {
        const heading = headingFact(context, fact);
        return heading?.text === options.release ? [heading] : [];
      });
      if (matches.length === 0) {
        context.emit.diagnostic({
          code: "markdown-release-heading-absent",
          message: `No Markdown heading named '${options.release}' was found`,
          rule: "release-selection",
        });
        return { started: false, complete: true };
      }
      if (matches.length > 1) {
        context.emit.diagnostic({
          code: "markdown-release-heading-ambiguous",
          message: `Multiple Markdown headings named '${options.release}' were found`,
          subject: matches[0]!.fact.subject,
          rule: "release-selection",
        });
        return { started: false, complete: true };
      }
      return { target: matches[0], started: false, complete: false };
    },
    line(state, line, context) {
      if (state.complete || !state.target) {
        return state;
      }
      if (!state.started) {
        return line.span.start === state.target.fact.subject!.start
          ? { ...state, started: true }
          : state;
      }
      const heading = parseHeading(line.text);
      if ((heading && heading.depth <= state.target.depth) || /^[ \t]*$/.test(line.text)) {
        return planEntry(state, context, options.entry, line.span.start);
      }
      return state;
    },
    finish(state, context) {
      if (state.started && !state.complete) {
        planEntry(state, context, options.entry, context.revision.text.length);
      }
    },
  };

  return Object.freeze({
    manifest,
    passes: Object.freeze([adaptLinePass(scanner), adaptLinePass(planner)]),
  });
}
