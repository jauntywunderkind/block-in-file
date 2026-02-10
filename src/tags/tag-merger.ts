import type { Tag } from "./types.js";
import type { TagMode } from "./tag-mode.js";

export function mergeTags(existingTags: Tag[], newTags: Tag[]): Tag[] {
  const tagMap = new Map<string, Tag>();

  for (const tag of existingTags) {
    tagMap.set(tag.name, tag);
  }

  for (const tag of newTags) {
    tagMap.set(tag.name, tag);
  }

  return Array.from(tagMap.values());
}

export function replaceTags(existingTags: Tag[], newTags: Tag[]): Tag[] {
  return newTags;
}

export function applyTagMode(existingTags: Tag[], newTags: Tag[], mode: TagMode): Tag[] {
  switch (mode) {
    case "merge":
      return mergeTags(existingTags, newTags);
    case "replace":
      return replaceTags(existingTags, newTags);
    default:
      return mergeTags(existingTags, newTags);
  }
}
