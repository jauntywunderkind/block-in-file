import { defineConfig } from "tsdown";

// Single-file, dependency-free CLI bundle for system-wide deployment:
// the wrapper only needs a plain `node` runtime, no npx/tsx/node_modules.
// Everything except node: builtins is bundled so non-admin users with a
// stock system node can execute it from a shared deployment directory.
export default defineConfig({
  clean: true,
  dts: false,
  entry: { "block-in-file.standalone": "block-in-file.ts" },
  format: "esm",
  outDir: "dist",
  deps: { alwaysBundle: [/./] },
  platform: "node",
});
