import { describe, it, expect } from "vitest";
import { parseAndInsertBlock } from "../src/block-parser.ts";

describe("additive mode", () => {
  const defaultOpts = {
    opener: "# blockinfile start",
    closer: "# blockinfile end",
    inputBlock: "line1\nline2\nline3",
  };

  it("adds missing lines to existing block", () => {
    const fileContent = "header\n# blockinfile start\nline1\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("preserves existing content and adds missing lines", () => {
    const fileContent = "header\n# blockinfile start\nline2\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line2",
      "line1",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("does nothing when all lines already exist", () => {
    const fileContent = "header\n# blockinfile start\nline1\nline2\nline3\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("adds missing lines before existing content with --additive-before BOF", () => {
    const fileContent = "header\n# blockinfile start\nline2\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
      additiveBefore: "BOF",
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line3",
      "line2",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("adds missing lines after existing content with --additive-after EOB (default)", () => {
    const fileContent = "header\n# blockinfile start\nline1\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
      additiveAfter: "EOB",
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("adds missing lines after existing content with --additive-after EOF", () => {
    const fileContent = "header\n# blockinfile start\nline1\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
      additiveAfter: "EOF",
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("adds missing lines after matching line with --additive-after regex", () => {
    const fileContent = "header\n# blockinfile start\nline1\nmarker\nline3\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
      additiveAfter: /^marker$/,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "marker",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("adds missing lines before matching line with --additive-before regex", () => {
    const fileContent = "header\n# blockinfile start\nline1\nmarker\nline3\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
      additiveBefore: /^marker$/,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "marker",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("creates new block if block does not exist and additive is set", () => {
    const fileContent = "header\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
    });

    expect(result.outputs).toContain("# blockinfile start");
    expect(result.outputs).toContain("line1");
    expect(result.outputs).toContain("line2");
    expect(result.outputs).toContain("line3");
    expect(result.outputs).toContain("# blockinfile end");
  });

  it("works with empty block", () => {
    const fileContent = "header\n# blockinfile start\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: true,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("replaces block when additive is false (default behavior)", () => {
    const fileContent = "header\n# blockinfile start\nold line1\nold line2\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      additive: false,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "line3",
      "# blockinfile end",
      "footer",
    ]);
  });

  it("handles duplicate lines in input without duplication", () => {
    const fileContent = "header\n# blockinfile start\nline1\n# blockinfile end\nfooter";
    const result = parseAndInsertBlock(fileContent, {
      ...defaultOpts,
      inputBlock: "line1\nline1\nline2",
      additive: true,
    });

    expect(result.outputs).toEqual([
      "header",
      "# blockinfile start",
      "line1",
      "line2",
      "# blockinfile end",
      "footer",
    ]);
  });
});
