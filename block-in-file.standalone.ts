#!/usr/bin/env node
// Standalone bundle entry: same CLI, but this file's shebang survives into
// dist/block-in-file.standalone.mjs so shared deployments can execute it
// directly with any user's stock node — no npx/tsx on PATH required.
import "./block-in-file.ts";
