import { describe, it, expect } from "vitest";
import {
  parseTags,
  generateTag,
  removeTags,
  addTags,
  stripTagsForMatching,
} from "../src/tags/tag.ts";

describe("tag parsing", () => {
  it.each([
    { line: "# block start [mytag]", expected: [{ name: "mytag", value: "" }] },
    { line: "# block start [mytag:value]", expected: [{ name: "mytag", value: "value" }] },
    { line: "# block start [timestamp:1770765014846000000]", expected: [{ name: "timestamp", value: "1770765014846000000" }] },
    { line: "# block start [tag-name_1:value_test]", expected: [{ name: "tag-name_1", value: "value_test" }] },
    { line: "# block-in-file start [tag:value]", expected: [{ name: "tag", value: "value" }] },
  ])("should parse tags from $line", ({ line, expected }) => {
    const tags = parseTags(line);
    expect(tags).toEqual(expected);
  });

  it("should parse multiple tags", () => {
    const line = "# block start [tag1:value1] [tag2:value2]";
    const tags = parseTags(line);
    expect(tags).toEqual([
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ]);
  });

  it("should parse tags with complex values", () => {
    const line = "# block start [anchor-bof:100] [timestamp:1234567890]";
    const tags = parseTags(line);
    expect(tags).toEqual([
      { name: "anchor-bof", value: "100" },
      { name: "timestamp", value: "1234567890" },
    ]);
  });

  it("should return empty array when no tags found", () => {
    const line = "# block start";
    const tags = parseTags(line);
    expect(tags).toEqual([]);
  });
});

describe("tag generation", () => {
  it.each([
    { name: "mytag", value: "", expected: "[mytag]" },
    { name: "mytag", value: "value", expected: "[mytag:value]" },
    { name: "timestamp", value: "1234567890", expected: "[timestamp:1234567890]" },
  ])("should generate tag: $expected", ({ name, value, expected }) => {
    const tag = generateTag(name, value);
    expect(tag).toBe(expected);
  });

  it("should generate multiple tags by concatenation", () => {
    const tag1 = generateTag("tag1", "value1");
    const tag2 = generateTag("tag2", "value2");
    const combined = `${tag1} ${tag2}`;
    expect(combined).toBe("[tag1:value1] [tag2:value2]");
  });
});

describe("tag removal", () => {
  it.each([
    { line: "# block start [mytag:value]", expected: "# block start" },
    { line: "# block start [tag1:value1] [tag2:value2]", expected: "# block start" },
    { line: "# block start", expected: "# block start" },
    { line: "# block start [mytag]", expected: "# block start" },
    { line: "# block start   [tag:value]   ", expected: "# block start" },
  ])("should remove tags from: $line", ({ line, expected }) => {
    const result = removeTags(line);
    expect(result).toBe(expected);
  });
});

describe("tag adding", () => {
  it.each([
    { line: "# block start", tags: [{ name: "mytag", value: "value" }], expected: "# block start [mytag:value]" },
    { line: "# block start", tags: [{ name: "mytag", value: "" }], expected: "# block start [mytag]" },
  ])("should add tags to: $line", ({ line, tags, expected }) => {
    const result = addTags(line, tags);
    expect(result).toBe(expected);
  });

  it("should add multiple tags to a line", () => {
    const line = "# block start";
    const tags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const result = addTags(line, tags);
    expect(result).toBe("# block start [tag1:value1] [tag2:value2]");
  });

  it("should not add tags if array is empty", () => {
    const line = "# block start";
    const tags: any[] = [];
    const result = addTags(line, tags);
    expect(result).toBe("# block start");
  });
});

describe("tag stripping for matching", () => {
  it.each([
    { line: "# block start [tag:value]", expected: "# block start" },
    { line: "# block start [tag1:value1] [tag2:value2]", expected: "# block start" },
    { line: "# block start", expected: "# block start" },
    { line: "# block-in-file start [timestamp:1234567890]", expected: "# block-in-file start" },
    { line: "  # block start [tag:value]  ", expected: "# block start" },
  ])("should strip tags from: $line", ({ line, expected }) => {
    const result = stripTagsForMatching(line);
    expect(result).toBe(expected);
  });
});
