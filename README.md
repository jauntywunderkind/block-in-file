# block-in-file

> insert/update/remove a block of multi-line text surrounded by customizable marker lines

A standalone re-interpretation of [Ansible's blockinfile](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/blockinfile_module.html). Powerful
technique to programmatically ongoingly update just one part of a file, leaving the rest of the file available for free-form editing.

# Installation

```
npm install -g block-in-file
```

or with pnpm:

```
pnpm add -g block-in-file
```

From a source checkout (the TypeScript runs directly under tsx):

```
git clone https://github.com/jauntywunderkind/block-in-file
cd block-in-file
pnpm install
pnpm dev
```

# Examples

Assume `hello-world.txt` starts as:

```text
hello, world
```

| Use Case                                            | Invocation                      | Stdin          | Before (`hello-world.txt`)           | Output (`hello-world.txt` after command) |
| --------------------------------------------------- | ------------------------------- | -------------- | ------------------------------------ | ---------------------------------------- |
| Default managed block. Good for idempotent inserts. | `block-in-file hello-world.txt` | `managed line` | <pre><code>hello, world</code></pre> | <pre><code>hello, world                  |

# blockinfile start

managed line

# blockinfile end</code></pre> |

| Force placement at file start with `BOF`. | `block-in-file hello-world.txt --name header --before BOF` | `top note` | <pre><code>hello, world</code></pre> | <pre><code># header start
top note

# header end

hello, world</code></pre> |
| Force placement at file end with `EOF`. | `block-in-file hello-world.txt --name footer --after EOF` | `bottom note` | <pre><code>hello, world</code></pre> | <pre><code>hello, world

# footer start

bottom note

# footer end</code></pre> |

| Regex anchor placement. Insert before a matched line (`^hello, world$`). | `block-in-file hello-world.txt --name preface --before '^hello, world$'` | `inserted before greeting` | <pre><code>title
hello, world
goodbye</code></pre> | <pre><code>title

# preface start

inserted before greeting

# preface end

hello, world
goodbye</code></pre> |
| Manage multiple independent blocks with different names. | `block-in-file hello-world.txt --name owners` then `block-in-file hello-world.txt --name status` | first run: `owner=team-a`; second run: `build=green` | <pre><code>hello, world</code></pre> | <pre><code>hello, world

# owners start

owner=team-a

# owners end

# status start

build=green

# status end</code></pre> |

| Read block content from a file using `-i` instead of stdin. | `block-in-file hello-world.txt --name from-file -i deploy.txt` | none (`deploy.txt` contains `deploy=true`) | <pre><code>hello, world</code></pre> | <pre><code>hello, world

# from-file start

deploy=true

# from-file end</code></pre> |

| Merge marker tags while updating content (`--timestamp` + `--tag-mode merge`). | `block-in-file hello-world.txt --name deploy --timestamp epoch-sec --tag-mode merge` | `deploy=true` | <pre><code>hello, world

# deploy start [env:dev]

deploy=false

# deploy end [env:dev]</code></pre> | <pre><code>hello, world

# deploy start [env:dev] [timestamp:1771009491]

deploy=true

# deploy end [env:dev] [timestamp:1771009491]</code></pre> |

| Anchor block at file start with `--anchor bof`. Higher priority = closer to edge. | `block-in-file hello-world.txt --name header --anchor bof` | `header content` | <pre><code>hello, world</code></pre> | <pre><code># header start [anchor-bof:100]
header content

# header end

hello, world</code></pre> |
| Anchor block at file end with `--anchor eof`. | `block-in-file hello-world.txt --name footer --anchor eof` | `footer content` | <pre><code>hello, world</code></pre> | <pre><code>hello, world

# footer start [anchor-eof:100]

footer content

# footer end</code></pre> |

| Anchor with custom priority. Higher values are more strongly positioned. | `block-in-file hello-world.txt --name critical --anchor bof:200` | `critical header` | <pre><code># header start [anchor-bof:100]
header content

# header end

hello, world</code></pre> | <pre><code># critical start [anchor-bof:200]
critical header

# critical end

# header start [anchor-bof:100]

header content

# header end

hello, world</code></pre> |
| Read a block back with `--read` (markers and provenance excluded, byte-exact; exits 1 when the block is missing). `diff <(block-in-file --read -n deploy hello-world.txt) deploy.txt` is a drift check against the source the block was installed from. | `block-in-file hello-world.txt --name deploy --read` | none | <pre><code>deploy=true</code></pre> | unchanged |
| Adopt an existing row without leaving an active duplicate; later runs update the named block. | `block-in-file sources.list --name apt-uri --comment '#' --adopt '^deb ' --mode ensure` | `deb https://example.org stable main` | <pre><code># apt-uri start

# source: &lt;STDIN&gt;

deb https://example.org stable main

# apt-uri end</code></pre> | Same content on rerun leaves the file unchanged; `--read` prints the row. |

| Update only; fail without writing when the named block or file is missing. | `block-in-file sources.list --name apt-uri --create false --mode ensure` | `deb https://example.org stable main` | existing block updated | Missing block or file: nonzero exit, no write. |

| Comment a block out in place, keeping it managed and addressable. | `block-in-file hello-world.txt --name deploy --comment-out` | none | <pre><code># deploy start

deploy=true

# deploy end</code></pre> | <pre><code># deploy start [commented]

# deploy=true

# deploy end</code></pre> |

| Restore it byte-for-byte later. | `block-in-file hello-world.txt --name deploy --uncomment` | none | <pre><code># deploy start [commented]

# deploy=true

# deploy end</code></pre> | original content restored, `[commented]` removed |

| Comment out several blocks at once, by name list or regex. | `block-in-file conf.txt --comment-out-all "deploy cron"`<br>`block-in-file conf.txt --comment-out-match '^dep-'` | none | two or more managed blocks | every addressed block commented out and tagged `[commented]`; `--uncomment-all` / `--uncomment-match` restore them |

| Read the effective content of a commented block. | `block-in-file hello-world.txt --name deploy --read-uncommented` | none | <pre><code># deploy start [commented]

# deploy=true

# deploy end</code></pre> | prints `deploy=true`; plain `--read` prints `# deploy=true` verbatim |

| Install a block already commented out. | `block-in-file hello-world.txt --name deploy --commented` | `deploy=true` | <pre><code>hello, world</code></pre> | <pre><code>hello, world

# deploy start [commented]

# deploy=true

# deploy end</code></pre> |

## Full Usage

| Flag                     | Aliases | Arguments                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--help`                 | `-h`    | none                      | Display this help message                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--version`              | `-v`    | none                      | Display this version                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--debug`                | `-d`    | none                      | Enable debug output                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--name`                 | `-n`    | `[name]`                  | Name for block (default: `blockinfile`)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--comment`              | `-c`    | `[comment]`               | Comment string for marker (default: `#`)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--marker-start`         | none    | `[marker-start]`          | Marker for start (default: `start`)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--marker-end`           | none    | `[marker-end]`            | Marker for end (default: `end`)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--dos`                  | none    | none                      | Use DOS line endings                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--input`                | `-i`    | `[input]`                 | Input file to read contents from, or `-` from stdin (default: `-`)                                                                                                                                                                                                                                                                                                                                                                                           |
| `--output`               | `-o`    | `[output]`                | Output file, or `-` for stdout, or `--` for no output, or `---` for overwriting existing file (default: `---`)                                                                                                                                                                                                                                                                                                                                               |
| `--before`               | `-b`    | `<before>`                | Insert block before matching line (regex or `BOF` for beginning of file)                                                                                                                                                                                                                                                                                                                                                                                     |
| `--after`                | `-a`    | `<after>`                 | Insert block after matching line (regex or `EOF` for end of file)                                                                                                                                                                                                                                                                                                                                                                                            |
| `--adopt`                | none    | `<regex>`                 | On first run replace the first matching line with a managed block in place; on subsequent runs update the named block. Error if no match; mutually exclusive with placement options `--before`, `--after`, `--anchor`.                                                                                                                                                                                                                                       |
| `--create`               | `-C`    | `<create>`                | `block` (default), `file`, and `true` retain legacy insertion behavior (`file`/`true` explicitly allow a missing file); `false`: update only, error if file or named block is absent.                                                                                                                                                                                                                                                                        |
| `--diff`                 | `-D`    | optional output file path | Print diff                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--backup`               | `-B`    | `<backup>`                | Create backup with suffix pattern (e.g. `foo`, `bak`)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--backup-dir`           | none    | `<backup-dir>`            | Directory to store backup files                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--state-on-fail`        | none    | `<state-on-fail>`         | Behavior when backup fails: `iterate` (add `.1` `.2`), `fail`, `overwrite`                                                                                                                                                                                                                                                                                                                                                                                   |
| `--validate`             | `-v`    | `<validate>`              | Validate with external command (use `%s` for file path)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--mode`                 | none    | `<mode>`                  | Operation mode: `ensure` (idempotent), `only` (create if missing), `none` (legacy always update)                                                                                                                                                                                                                                                                                                                                                             |
| `--force`                | `-f`    | none                      | Force mode; skip validation failures                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--temp-ext`             | none    | `<temp-ext>`              | Generic temp file extension (fallback for atomic/prevalidate)                                                                                                                                                                                                                                                                                                                                                                                                |
| `--temp-ext-atomic`      | none    | `<temp-ext-atomic>`       | Extension for atomic write temp files (default: `.atomic`)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--temp-ext-prevalidate` | none    | `<temp-ext-prevalidate>`  | Extension for validation temp files (default: `.prevalidate`)                                                                                                                                                                                                                                                                                                                                                                                                |
| `--append-newline`       | none    | none                      | Append blank line after block                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--blank-lines`          | none    | `keep\|never\|separators` | Blank-line emission contract (default `keep`); see below. Unknown values error.                                                                                                                                                                                                                                                                                                                                                                              |
| `--attributes`           | none    | `<attributes>`            | Set file attributes using `chattr` syntax (e.g. `+i`, `-i`, `+a`)                                                                                                                                                                                                                                                                                                                                                                                            |
| `--remove-all`           | none    | `<remove-all>`            | Remove all blocks with specified name(s), space-separated                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--remove`               | none    | `<name>`                  | Remove all blocks with this name; may be repeated                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--remove-match`         | none    | `<regex>`                 | Remove all blocks whose names match this regex; may be repeated                                                                                                                                                                                                                                                                                                                                                                                              |
| `--remove-orphans`       | none    | none                      | Remove orphaned blocks (blocks with empty content)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--read`                 | none    | none                      | Read mode: print the named block's contents (markers and provenance excluded) instead of writing; exits 1 when no block is found. Output is byte-exact, so `diff <(block-in-file --read -n NAME FILE) SOURCE` is a drift check against the file the block was installed from                                                                                                                                                                                 |
| `--comment-out`          | none    | none                      | Terminal op: comment the named block's body in place (one comment prefix per line, indent-preserving) and record `[commented]` on its opener. No input read; idempotent; exits 1 when the block is missing. See [Commented-out blocks](#commented-out-blocks)                                                                                                                                                                                                |
| `--uncomment`            | none    | none                      | Terminal op: restore a commented block in place (strip one comment layer per line, remove `[commented]`). No input read; idempotent; exits 1 when the block is missing                                                                                                                                                                                                                                                                                       |
| `--comment-out-all`      | none    | `<names>`                 | Terminal op: comment out every block with these space-separated names, same semantics as `--comment-out`. Merges with `--comment-out`; exits 1 when no addressed block exists                                                                                                                                                                                                                                                                                |
| `--uncomment-all`        | none    | `<names>`                 | Terminal op: restore every block with these space-separated names, same semantics as `--uncomment`. Merges with `--uncomment`; exits 1 when no addressed block exists                                                                                                                                                                                                                                                                                        |
| `--comment-out-match`    | none    | `<regex>`                 | Terminal op: comment out every block whose name matches this regex (repeatable), like `--remove-match`. Duplicate or unclosed addressed blocks are conflicts; exits 1 when no addressed block exists                                                                                                                                                                                                                                                         |
| `--uncomment-match`      | none    | `<regex>`                 | Terminal op: restore every block whose name matches this regex (repeatable). Same conflict and exit semantics as `--comment-out-match`                                                                                                                                                                                                                                                                                                                       |
| `--commented`            | none    | none                      | Emit the block body commented out on insert/update; creates or flips the block to `[commented]`. Updates of an already-commented block stay commented even without this flag                                                                                                                                                                                                                                                                                 |
| `--read-uncommented`     | none    | none                      | Read mode (implies `--read`): strip one comment prefix from each body line that carries it, returning the effective content; `--read` without it stays byte-exact verbatim                                                                                                                                                                                                                                                                                   |
| `--source-label`         | none    | `<text>`                  | Set the opaque provenance value (`# source: <text>` with default comment `#`). Unset: `<STDIN>` for stdin, input filename for `-i FILE`. Exact lowercase `none` or `false` omit the line, including on update; reserved values are case-sensitive (`None` is an ordinary label). A path or glob materially identifying the managing source is encouraged, e.g. `files/apt-srctools/apt-src-scheme.ts` or `/etc/apt/sources.list.d/*.sources: scheme policy`. |
| `--envsubst`             | none    | `[mode]`                  | Enable environment variable substitution. No value or `true`/`recursive` = recursive; `non-recursive` = single-pass; `false` = off (default: off)                                                                                                                                                                                                                                                                                                            |
| `--additive`             | none    | none                      | Ensure all input lines exist in block; add missing lines instead of replacing                                                                                                                                                                                                                                                                                                                                                                                |
| `--additive-before`      | none    | `<additive-before>`       | Position to add missing lines in additive mode (`regex`, `BOF`, or `EOB`/`EOF`)                                                                                                                                                                                                                                                                                                                                                                              |
| `--additive-after`       | none    | `<additive-after>`        | Position to add missing lines in additive mode (`regex`, `EOF`, or `EOB`)                                                                                                                                                                                                                                                                                                                                                                                    |
| `--timestamp`            | none    | `<timestamp>`             | Add timestamp to markers (default: `epoch-nano`; options: `epoch-nano`, `epoch-sec`, `iso8601`)                                                                                                                                                                                                                                                                                                                                                              |
| `--tag-mode`             | none    | `<tag-mode>`              | Tag handling: `merge` (default) or `replace`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--anchor`               | none    | `<anchor>`                | Anchor position: `bof[:priority]` or `eof[:priority]`. Higher priority = stronger edge positioning. Default priority: 100                                                                                                                                                                                                                                                                                                                                    |

<details>
<summary>Expand original CLI help text</summary>

```text
block-in-file (block-in-file v1.0.0)

USAGE:
  block-in-file <OPTIONS>

OPTIONS:
  -h, --help                                             Display this help message
  -v, --version                                          Display this version
  -d, --debug                                            Enable debug output
  -n, --name [name]                                      Name for block (default: blockinfile)
  -c, --comment [comment]                                Comment string for marker (default: #)
  --marker-start [marker-start]                          Marker for start (default: start)
  --marker-end [marker-end]                              Marker for end (default: end)
  --dos                                                  Use dos line endings
  -i, --input [input]                                    Input file to read contents from, or - from stdin (default: -)
  -o, --output [output]                                  Output file, or - for stdout, or -- for no output, or --- for overwriting existing file (default: ---)
  -b, --before <before>                                  Insert block before matching line (regex or BOF for beginning of file)
  -a, --after <after>                                    Insert block after matching line (regex or EOF for end of file)
  -C, --create <create>                                  Create file or block if missing (file, block, true, false)
  --adopt <adopt>                                        Wrap the first line matching REGEX in this block; update it if already managed
  -D, --diff                                             Print diff (optional output file path)
  -B, --backup <backup>                                  Create backup with suffix pattern (e.g., 'foo', 'bak')
  --backup-dir <backup-dir>                              Directory to store backup files
  --state-on-fail <state-on-fail>                        Behavior when backup fails: iterate (add .1 .2), fail, overwrite
  -v, --validate <validate>                              Validate with external command (use %s for file path)
  --mode <mode>                                          Operation mode: ensure (idempotent - skip if unchanged), only (create if missing - skip if exists), none (legacy - always update)
  -f, --force                                            Force mode - skip validation failures
  --temp-ext <temp-ext>                                  Generic temp file extension (fallback for atomic/prevalidate)
  --temp-ext-atomic <temp-ext-atomic>                    Extension for atomic write temp files (default: .atomic)
  --temp-ext-prevalidate <temp-ext-prevalidate>          Extension for validation temp files (default: .prevalidate)
  --append-newline                                       Append blank line after block
  --blank-lines <blank-lines>                            Blank lines: keep (default), never, or separators (one before new EOF blocks)
  --attributes <attributes>                              Set file attributes using chattr syntax (e.g., '+i', '-i', '+a')
  --remove-all <remove-all>                              Remove all blocks with specified name(s), space-separated
  --remove <name>                                        Remove all blocks with this name (repeatable)
  --remove-match <regex>                                 Remove all blocks whose names match this regex (repeatable)
  --remove-orphans                                       Remove orphaned blocks (blocks with empty content)
  --read                                                 Read mode: print the named block's contents (markers and
                                                         provenance excluded) instead of writing; exits 1 when no
                                                         block is found
  --comment-out                                          Comment out the named block's body in place (terminal op:
                                                          no input read; records [commented])
  --uncomment                                            Restore a commented-out block in place (terminal op:
                                                          strips one comment layer; removes [commented])
  --comment-out-all <comment-out-all>                    Comment out all blocks with these space-separated names (terminal op like --comment-out)
  --uncomment-all <uncomment-all>                        Restore all blocks with these space-separated names (terminal op like --uncomment)
  --comment-out-match <comment-out-match>                Comment out all blocks whose names match this regex (repeatable)
  --uncomment-match <uncomment-match>                    Restore all blocks whose names match this regex (repeatable)
  --commented                                            Emit the block body commented out (creates or flips to
                                                          [commented]; updates of a commented block stay commented)
  --read-uncommented                                     Read mode: strip one comment prefix from each body line
                                                          (implies --read)
  --source-label <source-label>                          Override provenance value (# source: TEXT); use a path or glob identifying the manager
  --envsubst [mode]                                      Enable environment variable substitution. No value or true/recursive = recursive; non-recursive = single-pass; false = off (default: off)
  --additive                                             Additive mode: ensure all input lines are in block, adding missing lines instead of replacing
  --additive-before <additive-before>                    Position to add missing lines in additive mode (regex, BOF for beginning of file, or EOB/EOF for end of block)
  --additive-after <additive-after>                      Position to add missing lines in additive mode (regex, EOF for end of file, or EOB for end of block)
  --timestamp <timestamp>                                Add timestamp to block markers (default: epoch-nano, options: epoch-nano, epoch-sec, iso8601)
  --tag-mode <tag-mode>                                  Tag handling strategy: merge (default) or replace. Merge preserves existing tags not being updated
  --anchor <anchor>                                      Anchor block position: bof[:priority] or eof[:priority]. Higher priority = stronger positioning at file edges. Default priority: 100
```

</details>

### Blank lines and stanza-delimited files

`--blank-lines keep` (default) does not add or remove blank lines on the block's behalf: adoption, in-place updates, and anchored inserts leave surrounding context where it was. `--blank-lines never` additionally discards blank/whitespace-only lines **inside the supplied block** (including on updates), and emits no adjacent padding. Existing surrounding blank lines are not cleaned up. `--blank-lines separators` also discards blank input lines; when a **new unanchored EOF or `--anchor eof`** block is inserted after existing content, it ensures exactly one blank line immediately before its begin marker (collapsing extra trailing blanks). In-place updates and other anchored inserts do not adjust surrounding separators. This is a textual emission policy, not a file-format parser.

In deb822 or other stanza-delimited formats, an unanchored EOF insertion with `keep` or `never` can merge into the trailing stanza. Use `separators` for a fresh stanza, or `--adopt` / an anchored insert for a field within a stanza. `--append-newline` is an **explicit override** under every mode: it still adds a blank line after the end marker, including under `never` or `separators`, and can break a stanza. Do not use it for mid-stanza updates.

## Tag System

Block markers support optional tags appended at the end in the format `[name:value]`. Tags are ignored when matching blocks for replacement, allowing metadata to be added without affecting block identity.

For example, with `--timestamp epoch-nano`:

```
# blockinfile start [timestamp:1770717943385000000]
content
# blockinfile end [timestamp:1770717943385000000]
```

The tags are automatically stripped when matching blocks, so updates work correctly even when timestamps or other tags change between runs. Multiple tags can be added, and custom tag types can be implemented in the future.

## Tag Mode

The `--tag-mode` option controls how existing tags are handled when updating blocks:

- **merge** (default): Preserves existing tags that aren't being updated. New tags overwrite tags with the same name.
  - If a block has `[foo]` and you add `--timestamp`, the result is `[foo] [timestamp:...]`.
  - If a block has `[timestamp:123]` and you add `--timestamp`, the old timestamp is replaced.

- **replace**: Removes all existing tags and uses only the newly specified tags.
  - If a block has `[foo] [timestamp:123]` and you use `--tag-mode replace --timestamp`,
    the result is `[timestamp:...]` (the `[foo]` tag is removed).

This allows you to maintain custom metadata on blocks while updating them programmatically.

## Commented-out blocks

A managed block can be made inert — its body commented out — without losing it: the
markers stay active so the block remains addressable, and a `[commented]` tag on the
opener records the state. Presence of the tag is the state; the tool owns the
`commented` tag name, and it is exempt from `--tag-mode`.

- **`--comment-out` / `--uncomment`** are terminal operations like `--remove`: they
  transform the existing named block in place, read no input, and exit 1 when the
  block is missing. Commenting prefixes each body line with the comment character
  (`--comment`, default `#`) after any indentation; blank lines and the provenance
  line are untouched. Uncommenting strips exactly one prefix layer per line, so
  `--comment-out` then `--uncomment` restores the original byte-for-byte, including
  body lines that were genuine comments (`# note` → `# # note` → `# note`).
  The family variants address many blocks at once: `--comment-out-all "a b"` /
  `--uncomment-all "a b"` take space-separated names, and
  `--comment-out-match <regex>` / `--uncomment-match <regex>` (repeatable) select
  names like `--remove-match`. They merge with the matching base flag, refuse to
  mix comment-out with uncomment flags, and run the duplicate/nested/unmatched
  conflict checks on every addressed name before flipping anything; exit 1 when
  nothing is addressed.
- **Updates respect the recorded state**: re-running the insert command that manages
  a commented block rewrites the body from the new input _stayed commented_ — a
  running recipe does not silently re-enable a disabled block. State changes only
  through the explicit operations. `--commented` forces commented emission, and is
  how you install a block already commented out.
- **Reads**: `--read` stays byte-exact verbatim, so the `diff <(...)` drift check
  against an uncommented source fails while the block is disabled — correct signal.
  `--read-uncommented` strips one comment prefix from each body line that carries
  it, returning the effective content.
- `--additive` combined with commented emission (the flag or a commented block) is
  an error rather than a silently wrong merge.
- Ambiguity is inherent: a hand-added bare comment line inside a commented block is
  indistinguishable from a commented content line and will be stripped on
  `--uncomment`. Re-running the managing recipe is the recovery path.
