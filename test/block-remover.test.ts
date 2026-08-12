import { describe, it, expect } from "vitest";
import { removeBlocks } from "../src/block-remover.ts";

describe("block-remover", () => {
  describe("removeBlocks", () => {
    it("removes single block by name", () => {
      const fileContent = "line1\n# blockinfile start\ncontent\n# blockinfile end\nline2\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\n");
      expect(stats.removed).toBe(1);
      expect(stats.orphans).toBe(0);
      expect(stats.blocks.length).toBe(1);
      expect(stats.blocks[0].blockName).toBe("blockinfile");
    });

    it("removes multiple blocks with same name", () => {
      const fileContent =
        "line1\n# blockinfile start\ncontent1\n# blockinfile end\nline2\n# blockinfile start\ncontent2\n# blockinfile end\nline3\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\nline3\n");
      expect(stats.removed).toBe(2);
      expect(stats.blocks.length).toBe(2);
    });

    it("removes blocks whose names match any regex", () => {
      const fileContent =
        "# app-cache start\ncache\n# app-cache end\n# app-worker start\nworker\n# app-worker end\n# database start\ndb\n# database end\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: [],
        blockNamePatterns: [/^app-/, /^database$/],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("");
      expect(stats.removed).toBe(3);
    });

    it("removes orphan blocks when removeOrphans is true", () => {
      const fileContent =
        "line1\n# blockinfile start\n\n# blockinfile end\nline2\n# blockinfile start   \n# blockinfile end\nline3\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: [],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: true,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\nline3\n");
      expect(stats.removed).toBe(2);
      expect(stats.orphans).toBe(2);
    });

    it("keeps orphan blocks when removeOrphans is false", () => {
      const fileContent = "line1\n# blockinfile start\n\n# blockinfile end\nline2\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\n");
      expect(stats.removed).toBe(1);
      expect(stats.orphans).toBe(0);
    });

    it("preserves content outside blocks", () => {
      const fileContent = "before\n# blockinfile start\ncontent\n# blockinfile end\nafter\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("before\nafter\n");
      expect(stats.removed).toBe(1);
    });

    it("handles empty file content", () => {
      const { content, stats } = removeBlocks({
        fileContent: "",
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("");
      expect(stats.removed).toBe(0);
    });

    it("handles file with no matching blocks", () => {
      const fileContent = "line1\nline2\nline3\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe(fileContent);
      expect(stats.removed).toBe(0);
    });

    it("preserves complete non-matching blocks", () => {
      const fileContent = "# keep start\ncontent\n# keep end\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["remove"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe(fileContent);
      expect(stats.removed).toBe(0);
    });

    // Regression (bif-remove-all-preserve-nontarget): --remove-all used to
    // restore only the content and closer of non-target blocks, dropping
    // their opener. Mirrors compfuzor's atuin config: removing
    // atuin-search-mode must leave the adjacent atuin-daemon block intact.
    it("preserves adjacent non-target block byte-for-byte when removing target", () => {
      const fileContent = [
        "detect_host_v2 = false",
        "",
        "# atuin-daemon start",
        "# source: daemon.conf",
        "enabled = true",
        "# atuin-daemon end",
        "# atuin-search-mode start",
        'search_mode = "prefix"',
        "# atuin-search-mode end",
        "",
      ].join("\n");
      const expected = [
        "detect_host_v2 = false",
        "",
        "# atuin-daemon start",
        "# source: daemon.conf",
        "enabled = true",
        "# atuin-daemon end",
        "",
      ].join("\n");
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["atuin-search-mode"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe(expected);
      expect(stats.removed).toBe(1);
      expect(stats.blocks[0].blockName).toBe("atuin-search-mode");
    });

    it("preserves non-target blocks on both sides of the target", () => {
      const fileContent = [
        "# keep-before start",
        "before = true",
        "# keep-before end",
        "# target start",
        "gone = true",
        "# target end",
        "# keep-after start",
        "after = true",
        "# keep-after end",
      ].join("\n");
      const expected = [
        "# keep-before start",
        "before = true",
        "# keep-before end",
        "# keep-after start",
        "after = true",
        "# keep-after end",
      ].join("\n");
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["target"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe(expected);
      expect(stats.removed).toBe(1);
    });

    it("handles unclosed blocks gracefully", () => {
      const fileContent = "line1\n# blockinfile start\ncontent\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: true,
        logger: {
          debug: () => {},
          log: () => {},
          warn: (msg: string) => expect(msg).toContain("Unclosed block"),
        },
      });

      expect(content).toContain("content");
      expect(stats.removed).toBe(0);
    });

    it("correctly tracks line numbers", () => {
      const fileContent = "line1\nline2\n# blockinfile start\ncontent\n# blockinfile end\nline5\n";
      const { stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(stats.blocks[0].startLine).toBe(3);
      expect(stats.blocks[0].endLine).toBe(5);
      expect(stats.blocks[0].content).toBe("content");
    });

    it("handles blocks with multi-line content", () => {
      const fileContent =
        "line1\n# blockinfile start\nlineA\nlineB\nlineC\n# blockinfile end\nline2\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["blockinfile"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\n");
      expect(stats.removed).toBe(1);
      expect(stats.blocks[0].content).toBe("lineA\nlineB\nlineC");
    });

    it("removes block when comment has trailing space (no double-space in closer)", () => {
      const fileContent = "line1\n# tgo start\ncontent\n# tgo end\nline2\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["tgo"],
        comment: "# ",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: false,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\n");
      expect(stats.removed).toBe(1);
    });

    it("handles mixed orphan and named blocks", () => {
      const fileContent =
        "line1\n# blockinfile start\n\n# blockinfile end\nline2\n# other start\ncontent\n# other end\nline3\n";
      const { content, stats } = removeBlocks({
        fileContent,
        blockNames: ["other"],
        comment: "#",
        markerStart: "start",
        markerEnd: "end",
        removeOrphans: true,
        debug: false,
        logger: { debug: () => {}, log: () => {}, warn: () => {} },
      });

      expect(content).toBe("line1\nline2\nline3\n");
      expect(stats.removed).toBe(2);
      expect(stats.orphans).toBe(1);
    });
  });
});
