import { describe, it, expect } from "vitest";
import {
  generateTimestampTag,
  parseTimestampFormat,
  type TimestampFormat,
} from "../src/timestamp.ts";

describe("timestamp generation", () => {
  it.each([
    { format: "epoch-nano" as const, pattern: /^\[timestamp:\d+\]$/ },
    { format: "epoch-sec" as const, pattern: /^\[timestamp:\d+\]$/ },
    { format: "iso8601" as const, pattern: /^\[timestamp:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]$/ },
  ])("should generate $format format", ({ format, pattern }) => {
    const timestamp = generateTimestampTag(format);
    expect(timestamp).toMatch(pattern);
  });

  it("should generate epoch-nano with 6 extra zeros", () => {
    const timestamp = generateTimestampTag("epoch-nano");
    const value = timestamp.replace(/^\[timestamp:/, "").replace(/\]$/, "");
    const numValue = Number(value);
    const milliseconds = numValue / 1000000;
    const now = Date.now();
    expect(milliseconds).toBeGreaterThan(now - 1000);
    expect(milliseconds).toBeLessThan(now + 1000);
  });

  it("should generate epoch-sec as seconds", () => {
    const timestamp = generateTimestampTag("epoch-sec");
    const value = timestamp.replace(/^\[timestamp:/, "").replace(/\]$/, "");
    const numValue = Number(value);
    const now = Math.floor(Date.now() / 1000);
    expect(numValue).toBeGreaterThanOrEqual(now - 1);
    expect(numValue).toBeLessThanOrEqual(now + 1);
  });

  it("should generate iso8601 in proper format", () => {
    const timestamp = generateTimestampTag("iso8601");
    const value = timestamp.replace(/^\[timestamp:/, "").replace(/\]$/, "");
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(value).toMatch(isoRegex);
  });
});

describe("timestamp format parsing", () => {
  it.each([
    "epoch-nano",
    "epoch-sec",
    "iso8601",
  ] as TimestampFormat[])("should parse $s", (format) => {
    const result = parseTimestampFormat(format);
    expect(result).toBe(format);
  });

  it("should return undefined for undefined input", () => {
    const result = parseTimestampFormat(undefined);
    expect(result).toBeUndefined();
  });

  it.each([
    "invalid",
    "unknown",
  ])("should throw error for invalid format: $s", (format) => {
    expect(() => parseTimestampFormat(format)).toThrow(`Invalid timestamp format: ${format}`);
  });
});

describe("timestamp format type", () => {
  it("should accept valid timestamp format types", () => {
    const formats: TimestampFormat[] = ["epoch-nano", "epoch-sec", "iso8601"];
    formats.forEach((format) => {
      const result = parseTimestampFormat(format);
      expect(result).toBe(format);
    });
  });
});
