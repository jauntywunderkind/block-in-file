import { describe, it, expect } from "vitest";
import { mergeTags, replaceTags, applyTagMode } from "../src/tags/tag-merger.ts";

describe("mergeTags", () => {
  it("should merge new tags into existing tags", () => {
    const existingTags = [{ name: "tag1", value: "value1" }];
    const newTags = [{ name: "tag2", value: "value2" }];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ]);
  });

  it("should update existing tags with new values", () => {
    const existingTags = [{ name: "tag1", value: "value1" }];
    const newTags = [{ name: "tag1", value: "newvalue" }];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([{ name: "tag1", value: "newvalue" }]);
  });

  it("should preserve tags not being updated", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags = [{ name: "tag1", value: "newvalue" }];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([
      { name: "tag1", value: "newvalue" },
      { name: "tag2", value: "value2" },
    ]);
  });

  it("should handle empty existing tags", () => {
    const existingTags: any[] = [];
    const newTags = [{ name: "tag1", value: "value1" }];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([{ name: "tag1", value: "value1" }]);
  });

  it("should handle empty new tags", () => {
    const existingTags = [{ name: "tag1", value: "value1" }];
    const newTags: any[] = [];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([{ name: "tag1", value: "value1" }]);
  });

  it("should merge timestamp tags", () => {
    const existingTags = [{ name: "timestamp", value: "1234567890" }];
    const newTags = [{ name: "timestamp", value: "9876543210" }];
    const result = mergeTags(existingTags, newTags);
    expect(result).toEqual([{ name: "timestamp", value: "9876543210" }]);
  });
});

describe("replaceTags", () => {
  it("should replace all existing tags with new tags", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags = [{ name: "tag3", value: "value3" }];
    const result = replaceTags(existingTags, newTags);
    expect(result).toEqual([{ name: "tag3", value: "value3" }]);
  });

  it("should return new tags when existing tags are empty", () => {
    const existingTags: any[] = [];
    const newTags = [{ name: "tag1", value: "value1" }];
    const result = replaceTags(existingTags, newTags);
    expect(result).toEqual([{ name: "tag1", value: "value1" }]);
  });

  it("should return empty array when both are empty", () => {
    const existingTags: any[] = [];
    const newTags: any[] = [];
    const result = replaceTags(existingTags, newTags);
    expect(result).toEqual([]);
  });

  it("should clear all tags when new tags is empty", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags: any[] = [];
    const result = replaceTags(existingTags, newTags);
    expect(result).toEqual([]);
  });
});

describe("applyTagMode", () => {
  it("should apply merge mode by default", () => {
    const existingTags = [{ name: "tag1", value: "value1" }];
    const newTags = [{ name: "tag2", value: "value2" }];
    const result = applyTagMode(existingTags, newTags, "merge");
    expect(result).toEqual([
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ]);
  });

  it("should apply merge mode and preserve existing tags", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
      { name: "anchor-bof", value: "100" },
    ];
    const newTags = [{ name: "timestamp", value: "1234567890" }];
    const result = applyTagMode(existingTags, newTags, "merge");
    expect(result).toEqual([
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
      { name: "anchor-bof", value: "100" },
      { name: "timestamp", value: "1234567890" },
    ]);
  });

  it("should apply merge mode and update existing tags", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "timestamp", value: "1234567890" },
    ];
    const newTags = [{ name: "timestamp", value: "9876543210" }];
    const result = applyTagMode(existingTags, newTags, "merge");
    expect(result).toEqual([
      { name: "tag1", value: "value1" },
      { name: "timestamp", value: "9876543210" },
    ]);
  });

  it("should apply replace mode", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags = [{ name: "tag3", value: "value3" }];
    const result = applyTagMode(existingTags, newTags, "replace");
    expect(result).toEqual([{ name: "tag3", value: "value3" }]);
  });

  it("should apply replace mode and clear all existing tags", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "timestamp", value: "1234567890" },
      { name: "anchor-bof", value: "100" },
    ];
    const newTags = [{ name: "timestamp", value: "9876543210" }];
    const result = applyTagMode(existingTags, newTags, "replace");
    expect(result).toEqual([{ name: "timestamp", value: "9876543210" }]);
  });

  it("should handle empty new tags with merge mode", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags: any[] = [];
    const result = applyTagMode(existingTags, newTags, "merge");
    expect(result).toEqual([
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ]);
  });

  it("should handle empty new tags with replace mode", () => {
    const existingTags = [
      { name: "tag1", value: "value1" },
      { name: "tag2", value: "value2" },
    ];
    const newTags: any[] = [];
    const result = applyTagMode(existingTags, newTags, "replace");
    expect(result).toEqual([]);
  });
});
