import type { Tag } from "./types.ts";

export function generateTag(name: string, value: string): string {
  return `[${name}:${value}]`;
}

export function parseTags(line: string): Tag[] {
  const tags: Tag[] = [];
  const tagRegex = /\[([a-zA-Z0-9_-]+):([^\[\]]+)\]/g;
  let match;

  while ((match = tagRegex.exec(line)) !== null) {
    tags.push({
      name: match[1],
      value: match[2],
    });
  }

  return tags;
}

export function removeTags(line: string): string {
  return line.replace(/\s*\[[a-zA-Z0-9_-]+:[^\[\]]+\]\s*/g, "").trim();
}

export function addTags(line: string, tags: Tag[]): string {
  if (tags.length === 0) {
    return line;
  }
  const tagStrings = tags.map((t) => generateTag(t.name, t.value));
  return `${line} ${tagStrings.join(" ")}`;
}

export function stripTagsForMatching(line: string): string {
  return removeTags(line);
}
