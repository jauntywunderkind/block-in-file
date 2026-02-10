import { describe, it, expect } from "vitest";
import {
  parseTags,
  generateTag,
  removeTags,
  addTags,
  stripTagsForMatching,
} from "../src/tags/tag.ts";

describe("tag parsing", () => {
  it("should parse a single tag without value", () => {
    const line = "# block start [mytag]";
    const tags = parseTags(line);
    expect(tags).toEqual([{ name: "mytag", value: "" }]);
  });

  it("should parse a single tag with value", () => {
    const line = "# block start [mytag:value]";
    const tags = parseTags(line);
    expect(tags).toEqual([{ name: "mytag", value: "value" }]);
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

  it("should parse timestamp with epoch-nano format", () => {
    const line = "# block start [timestamp:1770765014846000000]";
    const tags = parseTags(line);
    expect(tags).toEqual([{ name: "timestamp", value: "1770765014846000000" }]);
  });

  it("should parse tags with dashes and underscores", () => {
    const line = "# block start [tag-name_1:value_test]";
    const tags = parseTags(line);
    expect(tags).toEqual([{ name: "tag-name_1", value: "value_test" }]);
  });

  it("should return empty array when no tags found", () => {
    const line = "# block start";
    const tags = parseTags(line);
    expect(tags).toEqual([]);
  });

  it("should handle tags at end of line with other content", () => {
    const line = "# block-in-file start [tag:value]";
    const tags = parseTags(line);
    expect(tags).toEqual([{ name: "tag", value: "value" }]);
  });
});

describe("tag generation", () => {
  it("should generate a tag without value", () => {
    const tag = generateTag("mytag", "");
    expect(tag).toBe("[mytag]");
  });

  it("should generate a tag with value", () => {
    const tag = generateTag("mytag", "value");
    expect(tag).toBe("[mytag:value]");
  });

  it("should generate a timestamp tag", () => {
    const tag = generateTag("timestamp", "1234567890");
    expect(tag).toBe("[timestamp:1234567890]");
  });

  it("should generate multiple tags by concatenation", () => {
    const tag1 = generateTag("tag1", "value1");
    const tag2 = generateTag("tag2", "value2");
    const combined = `${tag1} ${tag2}`;
    expect(combined).toBe("[tag1:value1] [tag2:value2]");
  });
});

describe("tag removal", () => {
  it("should remove a single tag from a line", () => {
    const line = "# block start [mytag:value]";
    const result = removeTags(line);
    expect(result).toBe("# block start");
  });

  it("should remove multiple tags from a line", () => {
    const line = "# block start [tag1:value1] [tag2:value2]";
    const result = removeTags(line);
    expect(result).toBe("# block start");
  });

  it("should preserve line content without tags", () => {
    const line = "# block start";
    const result = removeTags(line);
    expect(result).toBe("# block start");
  });

  it("should handle tags without values", () => {
    const line = "# block start [mytag]";
    const result = removeTags(line);
    expect(result).toBe("# block start");
  });

  it("should trim whitespace after removal", () => {
    const line = "# block start   [tag:value]   ";
    const result = removeTags(line);
    expect(result).toBe("# block start");
  });
});

describe("tag adding", () => {
  it("should add a tag to a line", () => {
    const line = "# block start";
    const tags = [{ name: "mytag", value: "value" }];
    const result = addTags(line, tags);
    expect(result).toBe("# block start [mytag:value]");
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

  it("should add tags with empty values", () => {
    const line = "# block start";
    const tags = [{ name: "mytag", value: "" }];
    const result = addTags(line, tags);
    expect(result).toBe("# block start [mytag]");
  });

  it("should not add tags if array is empty", () => {
    const line = "# block start";
    const tags: any[] = [];
    const result = addTags(line, tags);
    expect(result).toBe("# block start");
  });
});

describe("tag stripping for matching", () => {
  it("should strip tags from a line for matching", () => {
    const line = "# block start [tag:value]";
    const result = stripTagsForMatching(line);
    expect(result).toBe("# block start");
  });

  it("should strip multiple tags from a line", () => {
    const line = "# block start [tag1:value1] [tag2:value2]";
    const result = stripTagsForMatching(line);
    expect(result).toBe("# block start");
  });

  it("should preserve lines without tags", () => {
    const line = "# block start";
    const result = stripTagsForMatching(line);
    expect(result).toBe("# block start");
  });

  it("should handle tags in different positions", () => {
    const line = "# block-in-file start [timestamp:1234567890]";
    const result = stripTagsForMatching(line);
    expect(result).toBe("# block-in-file start");
  });

  it("should trim whitespace", () => {
    const line = "  # block start [tag:value]  ";
    const result = stripTagsForMatching(line);
    expect(result).toBe("# block start");
  });
});
