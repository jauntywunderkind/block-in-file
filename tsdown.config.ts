import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    "block-in-file": "block-in-file.ts",
    index: "src/index.ts",
    toolkit: "src/toolkit.ts",
  },
  format: "esm",
  outDir: "dist",
});
