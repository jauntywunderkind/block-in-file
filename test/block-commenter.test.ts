import { describe, it, expect } from "vitest";
import {
  flipBlocks,
  commentBodyLine,
  commentBody,
  stripCommentLayer,
  hasStateTag,
  removeStateTag,
  splitBlockNames,
  findFlipTargetNames,
  detectFlipConflicts,
} from "../src/block-commenter.ts";

describe("commentBodyLine / stripCommentLayer", () => {
  it("prefixes plain lines with the comment character and one space", () => {
    expect(commentBodyLine("foo", "#")).toBe("# foo");
  });

  it("preserves indentation by prefixing after leading whitespace", () => {
    expect(commentBodyLine("  foo", "#")).toBe("  # foo");
    expect(commentBodyLine("\tfoo", "#")).toBe("\t# foo");
  });

  it("stacks on existing comment lines so stripping removes one layer", () => {
    expect(commentBodyLine("# note", "#")).toBe("# # note");
    expect(commentBodyLine("#bare", "#")).toBe("# #bare");
  });

  it("leaves blank and whitespace-only lines untouched", () => {
    expect(commentBodyLine("", "#")).toBe("");
    expect(commentBodyLine("   ", "#")).toBe("   ");
  });

  it("supports multi-character comment strings", () => {
    expect(commentBodyLine("foo", "//")).toBe("// foo");
    expect(commentBodyLine("  foo", ";;")).toBe("  ;; foo");
  });

  it("strips exactly one prefix plus at most one space", () => {
    expect(stripCommentLayer("# foo", "#")).toBe("foo");
    expect(stripCommentLayer("  # foo", "#")).toBe("  foo");
    expect(stripCommentLayer("# # note", "#")).toBe("# note");
    expect(stripCommentLayer("# #bare", "#")).toBe("#bare");
    expect(stripCommentLayer("#bare", "#")).toBe("bare");
    expect(stripCommentLayer("// foo", "//")).toBe("foo");
  });

  it("leaves lines without the prefix unchanged", () => {
    expect(stripCommentLayer("foo", "#")).toBe("foo");
    expect(stripCommentLayer("", "#")).toBe("");
  });

  it("round-trips a body through commentBody and per-line stripping", () => {
    const body = "alpha\n# note\n  indented\n\nbeta";
    const restored = commentBody(body, "#")
      .split("\n")
      .map((line) => stripCommentLayer(line, "#"))
      .join("\n");
    expect(restored).toBe(body);
  });
});

describe("state tag helpers", () => {
  it("detects the tag by name, valueless", () => {
    expect(hasStateTag([{ name: "commented", value: "" }])).toBe(true);
    expect(hasStateTag([{ name: "timestamp", value: "123" }])).toBe(false);
  });

  it("removes only the commented tag from a marker line", () => {
    expect(removeStateTag("# myblock start [commented]")).toBe("# myblock start");
    expect(removeStateTag("# myblock start [timestamp:1] [commented]")).toBe(
      "# myblock start [timestamp:1]",
    );
    expect(removeStateTag("# myblock start [timestamp:1]")).toBe("# myblock start [timestamp:1]");
  });
});

describe("splitBlockNames", () => {
  it("splits on whitespace and drops empties", () => {
    expect(splitBlockNames("a b  c")).toEqual(["a", "b", "c"]);
    expect(splitBlockNames("   ")).toEqual([]);
    expect(splitBlockNames("a")).toEqual(["a"]);
  });
});

describe("flipBlocks", () => {
  const opts = {
    blockNames: ["myblock"],
    comment: "#",
    markerStart: "start",
    markerEnd: "end",
    sourceLinePrefix: "# source:",
  };

  it("comments an active block and records [commented] on the opener", () => {
    const content =
      "pre\n# myblock start\n# source: <STDIN>\nalpha\n# note\n\n# myblock end\npost\n";
    const { content: out, stats } = flipBlocks({
      ...opts,
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe(
      "pre\n# myblock start [commented]\n# source: <STDIN>\n# alpha\n# # note\n\n# myblock end\npost\n",
    );
    expect(stats.flipped).toBe(1);
    expect(stats.alreadyInState).toBe(0);
    expect(stats.linesChanged).toBe(2);
  });

  it("is idempotent: an already-commented block is reported and untouched", () => {
    const content = "pre\n# myblock start [commented]\n# alpha\n# myblock end\npost\n";
    const { content: out, stats } = flipBlocks({
      ...opts,
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe(content);
    expect(stats.flipped).toBe(0);
    expect(stats.alreadyInState).toBe(1);
  });

  it("uncomment restores the original byte-for-byte", () => {
    const original =
      "pre\n# myblock start\n# source: x\nalpha\n# note\n  indented\n\n# myblock end\npost\n";
    const commented = flipBlocks({ ...opts, fileContent: original, target: "commented" }).content;
    const restored = flipBlocks({ ...opts, fileContent: commented, target: "active" }).content;
    expect(restored).toBe(original);
  });

  it("keeps other tags when flipping both ways", () => {
    const content = "# myblock start [timestamp:1]\nalpha\n# myblock end\n";
    const commented = flipBlocks({ ...opts, fileContent: content, target: "commented" }).content;
    expect(commented).toBe("# myblock start [timestamp:1] [commented]\n# alpha\n# myblock end\n");
    const restored = flipBlocks({ ...opts, fileContent: commented, target: "active" }).content;
    expect(restored).toBe(content);
  });

  it("flips every occurrence of the name", () => {
    const content =
      "# myblock start\na\n# myblock end\nbetween\n# myblock start [commented]\n# b\n# myblock end\n";
    const { stats } = flipBlocks({ ...opts, fileContent: content, target: "commented" });
    expect(stats.flipped).toBe(1);
    expect(stats.alreadyInState).toBe(1);
  });

  it("matches tagged openers because tags are stripped for matching", () => {
    const content = "# myblock start [anchor-bof:100]\nalpha\n# myblock end\n";
    const { content: out, stats } = flipBlocks({
      ...opts,
      fileContent: content,
      target: "commented",
    });
    expect(stats.flipped).toBe(1);
    expect(out).toContain("[anchor-bof:100] [commented]");
  });

  it("leaves other names and unmatched lines alone", () => {
    const content = "# other start\nalpha\n# other end\nplain\n";
    const { content: out, stats } = flipBlocks({
      ...opts,
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe(content);
    expect(stats.flipped).toBe(0);
    expect(stats.alreadyInState).toBe(0);
  });

  it("transforms an unclosed block to EOF and keeps it unclosed", () => {
    const content = "pre\n# myblock start\nalpha\n# not the closer\n";
    const { content: out, stats } = flipBlocks({
      ...opts,
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe("pre\n# myblock start [commented]\n# alpha\n# # not the closer\n");
    expect(stats.flipped).toBe(1);
  });

  it("supports a custom comment character", () => {
    const content = "// myblock start\nalpha\n// myblock end\n";
    const { content: out } = flipBlocks({
      blockNames: ["myblock"],
      comment: "//",
      markerStart: "start",
      markerEnd: "end",
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe("// myblock start [commented]\n// alpha\n// myblock end\n");
  });

  it("flips multiple named blocks in one pass and records their names", () => {
    const content =
      "# a start\none\n# a end\nplain\n# b start\ntwo\n# b end\n# c start\nthree\n# c end\n";
    const { content: out, stats } = flipBlocks({
      blockNames: ["a", "b"],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe(
      "# a start [commented]\n# one\n# a end\nplain\n# b start [commented]\n# two\n# b end\n# c start\nthree\n# c end\n",
    );
    expect(stats.flipped).toBe(2);
    expect(stats.blocks.map((b) => b.name)).toEqual(["a", "b"]);
  });

  it("flips blocks whose names match a regex, leaving others alone", () => {
    const content =
      "# dep-apt start\none\n# dep-apt end\n# keep start\ntwo\n# keep end\n# dep-cron start\nthree\n# dep-cron end\n";
    const { content: out, stats } = flipBlocks({
      blockNames: [],
      blockNamePatterns: [/^dep-/],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
      fileContent: content,
      target: "commented",
    });
    expect(out).toContain("# dep-apt start [commented]\n# one");
    expect(out).toContain("# dep-cron start [commented]\n# three");
    expect(out).toContain("# keep start\ntwo");
    expect(stats.flipped).toBe(2);
  });

  it("combines exact names and patterns in one selection", () => {
    const content = "# a start\none\n# a end\n# x-one start\ntwo\n# x-one end\n";
    const { stats } = flipBlocks({
      blockNames: ["a"],
      blockNamePatterns: [/^x-/],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
      fileContent: content,
      target: "commented",
    });
    expect(stats.flipped).toBe(2);
  });

  it("binds closers to the open block's name, keeping other names as body", () => {
    const content = "# outer start\n# inner start\nline\n# inner end\n# outer end\n";
    const { content: out, stats } = flipBlocks({
      blockNames: ["outer"],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
      fileContent: content,
      target: "commented",
    });
    expect(out).toBe(
      "# outer start [commented]\n# # inner start\n# line\n# # inner end\n# outer end\n",
    );
    expect(stats.flipped).toBe(1);
  });

  it("finds concrete target names for a selection, deduplicated", () => {
    const content = "# a start\n# a end\n# x-one start\n# x-one end\nplain\n";
    expect(
      findFlipTargetNames({
        fileContent: content,
        blockNames: ["a", "a"],
        blockNamePatterns: [/^x-/],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
      }),
    ).toEqual(["a", "x-one"]);
  });

  it("detects duplicate and unmatched conflicts per addressed name", () => {
    const duplicated = "# a start\none\n# a end\nmid\n# a start\ntwo\n# a end\n";
    const conflicts = detectFlipConflicts({
      fileContent: duplicated,
      blockNames: [],
      blockNamePatterns: [/^a$/],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
    });
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.type === "duplicate")).toBe(true);

    const unclosed = "# b start\nno closer\n";
    const unmatched = detectFlipConflicts({
      fileContent: unclosed,
      blockNames: ["b"],
      comment: "#",
      markerStart: "start",
      markerEnd: "end",
    });
    expect(unmatched.some((c) => c.type === "mismatched")).toBe(true);
  });
});
