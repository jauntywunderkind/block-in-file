import { describe, it, expect } from "vitest";
import { readBlocks } from "../src/block-reader.ts";

const defaultOpts = {
  opener: "# myblock start",
  closer: "# myblock end",
  sourceLinePrefix: "# source:",
};

describe("readBlocks", () => {
  it("extracts body between markers, excluding markers", () => {
    const content = ["pre", "# myblock start", "alpha", "beta", "# myblock end", "post"].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toEqual(["alpha", "beta"]);
    expect(blocks[0].startLine).toBe(2);
    expect(blocks[0].endLine).toBe(5);
    expect(blocks[0].unclosed).toBe(false);
  });

  it("excludes provenance line from body and captures its path", () => {
    const content = [
      "# myblock start",
      "# source: /opt/foo/etc/foo.conf",
      "alpha",
      "# myblock end",
    ].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks[0].body).toEqual(["alpha"]);
    expect(blocks[0].raw).toEqual(["# source: /opt/foo/etc/foo.conf", "alpha"]);
    expect(blocks[0].source).toBe("/opt/foo/etc/foo.conf");
  });

  it("returns every block with the same name", () => {
    const content = [
      "# myblock start",
      "one",
      "# myblock end",
      "between",
      "# myblock start",
      "two",
      "# myblock end",
    ].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].body).toEqual(["one"]);
    expect(blocks[1].body).toEqual(["two"]);
  });

  it("matches tag-suffixed markers", () => {
    const content = ["# myblock start [ts:123]", "alpha", "# myblock end"].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toEqual(["alpha"]);
  });

  it("reports unclosed blocks", () => {
    const content = ["# myblock start", "alpha", "beta"].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].unclosed).toBe(true);
    expect(blocks[0].endLine).toBe(0);
    expect(blocks[0].body).toEqual(["alpha", "beta"]);
  });

  it("round-trips content written with a trailing newline", () => {
    const input = "alpha\nbeta\n";
    // The write path splits input into lines and keeps the trailing "" line,
    // so the block body reproduces the input byte-for-byte when joined.
    const content = ["# myblock start", ...input.split("\n"), "# myblock end"].join("\n");
    const blocks = readBlocks(content, defaultOpts);
    expect(blocks[0].body.join("\n")).toBe(input);
  });

  it("honors custom comment and marker strings", () => {
    const content = ["<!-- myblock begin -->", "alpha", "<!-- myblock finish -->"].join("\n");
    const blocks = readBlocks(content, {
      opener: "<!-- myblock begin -->",
      closer: "<!-- myblock finish -->",
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toEqual(["alpha"]);
  });

  it("keeps provenance-looking content lines when no prefix is given", () => {
    const content = ["# myblock start", "# source: real content", "# myblock end"].join("\n");
    const blocks = readBlocks(content, {
      opener: "# myblock start",
      closer: "# myblock end",
    });
    expect(blocks[0].body).toEqual(["# source: real content"]);
    expect(blocks[0].source).toBeUndefined();
  });

  it("returns an empty list when no block matches", () => {
    expect(readBlocks("nothing here", defaultOpts)).toEqual([]);
  });
});
