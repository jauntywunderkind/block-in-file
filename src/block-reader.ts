import { stripTagsForMatching } from "./tags/tags.ts";

export interface ReadBlockOptions {
  /** Expected opener line, e.g. `# name start` */
  opener: string;
  /** Expected closer line, e.g. `# name end` */
  closer: string;
  /** Provenance prefix (e.g. `# source:`); matching lines are excluded from body */
  sourceLinePrefix?: string;
}

export interface ReadBlock {
  /** 1-based line number of the opener marker */
  startLine: number;
  /** 1-based line number of the closer marker (0 when the block is unclosed) */
  endLine: number;
  /** true when no closer marker was found */
  unclosed: boolean;
  /** Source path recorded by the provenance line, when present */
  source?: string;
  /** Lines strictly between the markers, provenance lines excluded */
  body: string[];
  /** Lines strictly between the markers, verbatim */
  raw: string[];
}

/**
 * Extract every block with the given opener/closer markers from a file's
 * content. Marker matching mirrors block-parser.ts: lines are trimmed and
 * tag-suffixed markers (`# name start @tag`) match their untagged form.
 *
 * The inverse of the write path: content written for input `I` reads back
 * with `body.join("\n") === I` (provenance and markers are structural, not
 * content), which is what makes `diff <(block-in-file --read ...) source`
 * a byte-exact drift check.
 */
export function readBlocks(fileContent: string, opts: ReadBlockOptions): ReadBlock[] {
  const { opener, closer, sourceLinePrefix } = opts;
  const lines = fileContent.split("\n");

  const isOpener = (line: string) => stripTagsForMatching(line.trim()) === opener;
  const isCloser = (line: string) => stripTagsForMatching(line.trim()) === closer;
  const isSourceLine = (line: string) =>
    sourceLinePrefix ? line.trim().startsWith(sourceLinePrefix) : false;

  const blocks: ReadBlock[] = [];
  let startLine = 0;
  let body: string[] = [];
  let raw: string[] = [];
  let source: string | undefined;

  const flush = (endLine: number, unclosed: boolean) => {
    blocks.push({ startLine, endLine, unclosed, source, body, raw });
    startLine = 0;
    body = [];
    raw = [];
    source = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (startLine === 0) {
      if (isOpener(line)) startLine = i + 1;
      continue;
    }
    if (isCloser(line)) {
      flush(i + 1, false);
      continue;
    }
    raw.push(line);
    if (isSourceLine(line)) {
      const prefix = sourceLinePrefix as string;
      source = line.trim().slice(prefix.length).trim();
      continue;
    }
    body.push(line);
  }

  if (startLine !== 0) flush(0, true);

  return blocks;
}
