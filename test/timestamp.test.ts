import { describe, it, expect } from "vitest";
import {
  generateTimestampTag,
  parseTimestampFormat,
  type TimestampFormat,
} from "../src/timestamp.ts";

describe("timestamp generation", () => {
  it("should generate epoch-nano format", () => {
    const timestamp = generateTimestampTag("epoch-nano");
    expect(timestamp).toMatch(/^\[timestamp:\d+\]$/);
  });

  it("should generate epoch-sec format", () => {
    const timestamp = generateTimestampTag("epoch-sec");
    expect(timestamp).toMatch(/^\[timestamp:\d+\]$/);
  });

  it("should generate iso8601 format", () => {
    const timestamp = generateTimestampTag("iso8601");
    expect(timestamp).toMatch(/^\[timestamp:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]$/);
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
  it("should parse epoch-nano", () => {
    const result = parseTimestampFormat("epoch-nano");
    expect(result).toBe("epoch-nano");
  });

  it("should parse epoch-sec", () => {
    const result = parseTimestampFormat("epoch-sec");
    expect(result).toBe("epoch-sec");
  });

  it("should parse iso8601", () => {
    const result = parseTimestampFormat("iso8601");
    expect(result).toBe("iso8601");
  });

  it("should return undefined for undefined input", () => {
    const result = parseTimestampFormat(undefined);
    expect(result).toBeUndefined();
  });

  it("should throw error for invalid format", () => {
    expect(() => parseTimestampFormat("invalid")).toThrow(
      "Invalid timestamp format: invalid. Valid options: epoch-nano, epoch-sec, iso8601",
    );
  });

  it("should throw error with custom message for invalid format", () => {
    expect(() => parseTimestampFormat("unknown")).toThrow("Invalid timestamp format: unknown");
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
