---
type: Exit assessment
title: Exiting Deno — what is still load-bearing and the ordered way out
description: Complete deno touchpoint inventory for block-in-file, a zero-behavior-change verdict per consumer class, ordered exit steps with effort/risk, deno.json disposition, and compfuzor reorientation notes.
resource: /.design/deno-exit/deno-exit0.glm53.md
tags: [block-in-file, deno, node, packaging, npm, exit]
status: draft
generated:
  by: model:zai/glm-5.3
  at: 2026-10-30T00:00:00Z
verified: { by: human:pending, at: pending }
sources:
  - id: parent-commission
    resource: opencode://ses_e70c3b5bdffehkbqioxQ0iGNVr
    title: Commissioning session — owner reports Deno project winding down; production deploy verified 100% node via compfuzor nodejs lane today; asks for inventory, verdict, ordered steps, compfuzor notes, deno.json disposition
  - id: compfuzor-nodejs-lane
    resource: /../../compfuzor/block-in-file.src.pb
    title: Compfuzor playbook — NODEJS lane builds and promotes the standalone bundle as the global command (today's verified deploy path)
---

# Exiting Deno — what is still load-bearing, and the ordered way out

## Headline: deno is not load-bearing in the code

`src/`, `test/`, and both entry files contain **zero** `Deno.*` API usage and
**zero** `jsr:` / `deno.land` / `@std/*` imports (verified by search across the
tree, excluding `node_modules`). The runtime, tests, formatter, linter,
typechecker, build, and published package are all node-native already. What
remains of deno is **metadata and prose**: `deno.json` (three task aliases +
a fmt block), `deno.lock` (stale), and the README install section — which is
broken *independently* of any exit decision. The exit is therefore a cleanup
and a repair, not a port.

## Situation and ask

The owner reports the Deno project itself is winding down and wants to know
what deno is still load-bearing for in BIF and what the exit looks like. Today
the production path was re-verified as 100% node: compfuzor's nodejs lane
(`pnpm i --frozen-lockfile` + `pnpm run build`) produced
`dist/block-in-file.standalone.mjs`, promoted and linked as the global
command, running on stock node. This wave inventories every remaining deno
touchpoint, gives a per-consumer verdict, and orders the exit steps.

## Deno touchpoint inventory (complete)

| Touchpoint | State | Evidence |
|---|---|---|
| Runtime APIs in source | **none** | no `Deno.*` anywhere in `src/`, `test/`, entries |
| jsr / deno.land imports | **none** | no `jsr:`/`@std`/`deno.land` imports in tree |
| Entry shebangs | node-oriented | `block-in-file.ts` → `#!/usr/bin/env -S npx tsx`; `block-in-file.standalone.ts` → `#!/usr/bin/env node` |
| `deno.json` | 3 tasks + fmt block | `block-in-file`, `install:error-perms`, `install:dir`; fmt: tabs, no semicolons, width 160 |
| `deno.lock` | **stale, vestigial** | pins gunshi 0.27/0.28 (package.json: ^0.37.3), vitest 4 (^5.0.1), oxfmt 0.27 (0.70), @types/node 25 (26), tsx 4.21 (4.23.15); its jsr `@std/bytes`/`@std/io`/`@std/streams` entries reference imports that no longer exist anywhere in the repo |
| README install section | **already broken, twice** | see below |
| CI | **none exists** | no `.github/` at all — nothing to change |
| Test stack | vitest | `test/**/*.test.ts`, node environment (`vitest.config.ts`) |
| fmt / lint | oxfmt / oxlint | `check:fmt` passes today with no oxfmt config file; the deno fmt block is a redundant second formatter definition (`.prettierrc.json` is likewise inert — no prettier anywhere in scripts or devDeps) |
| Build / publish | tsdown + npm | `build` = bundle + standalone; `prepack` builds; `bin`/`exports` point at `dist/` only |
| npm publication | 1.0.2 **not published** | registry has 1.0.0, 1.0.1 (`latest` = 1.0.1); local package.json is 1.0.2 |
| Dev loop | deno optional convenience | `deno task block-in-file` still works via Deno 2 BYONM (resolves bare `gunshi` from package.json + pnpm `node_modules`), but the node equivalent already exists: `npx tsx block-in-file.ts` (the entry's own shebang) |

### The README install section is broken today

`README.md` offers two install paths, both deno, both non-functional against
current code:

1. `deno install --allow-read --allow-write --allow-net https://raw.githubusercontent.com/.../block-in-file.ts`
   — `block-in-file.ts` imports the bare npm specifier `gunshi` (plus
   `args-tokenizer`, `tinyexec` transitively). A remote-URL install has no
   package.json context and no import map, so the bare specifier cannot
   resolve; the script would need `npm:` prefixes or an import map. This
   instruction predates the library-ization to npm dependencies.
2. `git clone … ; deno task install` — **no `install` task exists in
   `deno.json`** (only `install:error-perms` and `install:dir`). The referenced
   task is gone.

So the deno-exit README rewrite is a repair of dead instructions, not a
behavior change for any working path.

### Side finding: `--version` lies

`block-in-file.ts` hardcodes `version: "1.0.0"` in the `cli()` call (line 234)
while the package is at 1.0.2. Worth fixing in the same release that ships the
exit (read from package.json or bump the literal).

## Verdict: can BIF go node-only with zero behavior change?

**Yes — for every consumer class that has a working path today.**

- **Published npm consumers** — nothing changes, full stop. The package ships
  `dist/` only (`files`, `bin`, `exports`); no deno artifact participates.
- **Standalone / global-command users (compfuzor lane)** — already node;
  verified by today's fresh-host deploy. `deno.json` is not read by this path.
- **Hand global-installs** — the only deno-flavored path is the README's, and
  it is already broken. Replacement: `npm i -g block-in-file` (or
  `pnpm i -g`; note the compfuzor playbook's observation that per-admin
  `pnpm link -g` cannot serve shared consumers — for multi-user hosts the
  standalone lane is the right tool, which is what compfuzor does).
- **Source-checkout developers** — deleting `deno.json` costs only the
  muscle-memory alias `deno task block-in-file`. Everything else already has a
  package.json script (`build`, `check`, `test`) and direct-source execution
  survives via `npx tsx block-in-file.ts` (tsx is a devDependency). The TS
  source stays directly runnable; contributors do not need to build first.
- **Anyone following the README today** — there is no one; both instructions
  fail. Exiting deno strictly improves them.

One genuine nuance: a developer who *insists* on deno can keep running
`deno run block-in-file.ts` even after `deno.json` and `deno.lock` are
deleted — BYONM resolution comes from `package.json`, not from `deno.json`.
The file only provided task aliases. So deleting it breaks nobody's runtime;
it only retires aliases.

## Ordered next steps

| # | Step | Effort | Risk |
|---|---|---|---|
| 1 | **Rewrite README install section**: `npm i -g block-in-file` (or pnpm) as primary; keep the git-clone + build path (`pnpm i && pnpm build`) as source alternative; drop the `~/.deno/bin` PATH line | S | zero — replaces instructions that are already broken |
| 2 | **Delete `deno.json` outright** (disposition rationale below); no task ports are needed except optionally `"dev": "tsx block-in-file.ts"` in package.json scripts as the documented direct-source loop | S | zero |
| 3 | **Delete `deno.lock`** in the same commit — stale (version drift vs package.json) and references jsr imports that no longer exist in the tree; regenerating a lockfile for a runtime being exited is waste | XS | zero |
| 4 | **Version bump + release hygiene**: local 1.0.2 is unpublished. Dropping the documented deno install path is a removal of public surface — at least a **minor** bump under the workspace's pre-alpha-style policy, and semver-honest post-1.0 since README-documented behavior changes. Recommend shipping the exit as **1.1.0** (fold the unpublished 1.0.2 changes in; publishing 1.0.2 first and 1.1.0 immediately after is churn). In the same release, fix the hardcoded `version: "1.0.0"` in `block-in-file.ts` | S | low — normal release risk |
| 5 | **CI**: nothing to do — no workflows exist. If CI lands later, it naturally uses the package.json `check`/`test` scripts | — | — |
| 6 | **Tidy (optional)**: `.prettierrc.json` is inert (no prettier in deps or scripts; oxfmt owns fmt and passes with no config). Remove it or leave it; removal belongs in the same cleanup commit | XS | zero |
| 7 | **Compfuzor reorientation** — see inventory below; the only BIF-specific items are stale design-doc prose | S | zero |

Order matters only in that 1–3 land together (one cleanup commit), and 4
follows as its own release commit so the npm publication carries exactly the
post-exit tree.

## `deno.json` disposition: delete outright

- **Keep as thin compat shim?** No. The tasks it offers are either broken by
  omission (the README's `deno task install` never existed in it) or redundant
  (`block-in-file` duplicates `npx tsx block-in-file.ts`). While deno winds
  down, a shim keeps a second, misleading "how to run this" story alive and
  invites drift between it and the real scripts.
- **Reduce to fmt-only?** No. oxfmt already owns formatting — `check:fmt`
  passes today with no oxfmt config — so the deno fmt block is a second
  formatter definition that can silently diverge. One formatter, zero config.
- **Delete.** It matches reality on every axis (runtime, tests, fmt, lint,
  install, CI) and it cannot break a working path: bare
  `deno run block-in-file.ts` continues to work off package.json for as long
  as deno 2 exists for holdouts.

## Compfuzor reorientation notes (sidequest inventory)

BIF itself is already reoriented — `block-in-file.src.pb` uses the nodejs lane
exclusively (`NODEJS: True`, promotes the standalone, links the global bin).
No BIF playbook invokes deno. The hits below are either stale prose or deno
toolchain management unrelated to BIF:

**Stale BIF prose (update opportunistically):**

- `design/config-anneal/use-cases0.glm53.md` ~L141 ("provision toolchains
  with mise (deno for block-in-file…)"), ~L173 (global-bin via
  `deno task install:dir`), ~L294 — describes the pre-node BIF.
- `design/steamos-install/steamos-install2.gpt56s.md` ~L231 — "the
  `block-in-file` Deno wrapper has explicit runtime permissions."
- `design/apt-srctools/bif-wishlist.glm53m.md` ~L33 — historical note about a
  deno-build README discrepancy.

**Deno toolchain management (decide independently of BIF, on deno's own wind-down):**

- `deno.opt.pb` — vendor installer (deno.land install.sh → global bin).
- `deno.src.pb` — deno from source (Rust build).
- `deno-dotland.src.pb`, `deno-ddoc.src.pb` — deno ecosystem tooling.
- `asdf.src.pb` (~L27) — deno plugin entry; `mise.opt.pb` ~L116–121 and
  `mise2.opt.pb` ~L130–135 — deno as installable tool + cache group.
- `win-choco.pb` ~L17 — deno in the Windows choco list.
- `vscode.repo.pb` ~L45 (`denoland.vscode-deno`); `vscode-js-debug.src.pb` L1
  ("wanted for nvim-daps's deno support").
- `files/astrovim/*` (mason entries, commented community pack) and
  `files/neovim/init.lua` ~L7 — editor LSP wiring gated on deno presence.
- `files/mise-cache.ts` + `doc/mise/cache.md` — deno cache clearing in the
  mise-cache tool; `tests/integration/mise_cache.test.py` ~L88 lists deno.

None of these assume deno as BIF's runtime; they assume deno exists as a
toolchain. Reorienting them is part of the broader deno wind-down, not the BIF
exit.

## Out of scope

This is an exit assessment, not a rewrite plan: no restructurings, no CLI
redesign, no bundler changes. The [libraryize](/.design/libraryize/) and
[cli](/.design/cli/) threads own those fronts.
