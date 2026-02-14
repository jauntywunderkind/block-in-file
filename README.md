# block-in-file

> insert/update/remove a block of multi-line text surrounded by customizable marker lines

A standalone re-interpretation of [Ansible's blockinfile](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/blockinfile_module.html). Powerful
technique to programmatically ongoingly update just one part of a file, leaving the rest of the file available for free-form editing.

# Installation

```
deno install --allow-read --allow-write --allow-net https://raw.githubusercontent.com/jauntywunderkind/block-in-file/main/block-in-file.ts
PATH="$HOME/.deno/bin:$PATH"
```

Alternatively,

```
git clone https://github.com/jauntywunderkind/block-in-file
cd block-in-file
deno task install
```

# Examples

Assume `hello-world.txt` starts as:

```text
hello, world
```

| Use Case | Invocation | Stdin | Before (`hello-world.txt`) | Output (`hello-world.txt` after command) |
| --- | --- | --- | --- | --- |
| Default managed block. Good for idempotent inserts. | `block-in-file hello-world.txt` | `managed line` | <pre><code>hello, world</code></pre> | <pre><code>hello, world
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

## Full Usage

| Flag | Aliases | Arguments | Description |
| --- | --- | --- | --- |
| `--help` | `-h` | none | Display this help message |
| `--version` | `-v` | none | Display this version |
| `--debug` | `-d` | none | Enable debug output |
| `--name` | `-n` | `[name]` | Name for block (default: `blockinfile`) |
| `--comment` | `-c` | `[comment]` | Comment string for marker (default: `#`) |
| `--marker-start` | none | `[marker-start]` | Marker for start (default: `start`) |
| `--marker-end` | none | `[marker-end]` | Marker for end (default: `end`) |
| `--dos` | none | none | Use DOS line endings |
| `--input` | `-i` | `[input]` | Input file to read contents from, or `-` from stdin (default: `-`) |
| `--output` | `-o` | `[output]` | Output file, or `-` for stdout, or `--` for no output, or `---` for overwriting existing file (default: `---`) |
| `--before` | `-b` | `<before>` | Insert block before matching line (regex or `BOF` for beginning of file) |
| `--after` | `-a` | `<after>` | Insert block after matching line (regex or `EOF` for end of file) |
| `--create` | `-C` | `<create>` | Create file or block if missing (`file`, `block`, `true`, `false`) |
| `--diff` | `-D` | optional output file path | Print diff |
| `--backup` | `-B` | `<backup>` | Create backup with suffix pattern (e.g. `foo`, `bak`) |
| `--backup-dir` | none | `<backup-dir>` | Directory to store backup files |
| `--state-on-fail` | none | `<state-on-fail>` | Behavior when backup fails: `iterate` (add `.1` `.2`), `fail`, `overwrite` |
| `--validate` | `-v` | `<validate>` | Validate with external command (use `%s` for file path) |
| `--mode` | none | `<mode>` | Operation mode: `ensure` (idempotent), `only` (create if missing), `none` (legacy always update) |
| `--force` | `-f` | none | Force mode; skip validation failures |
| `--temp-ext` | none | `<temp-ext>` | Generic temp file extension (fallback for atomic/prevalidate) |
| `--temp-ext-atomic` | none | `<temp-ext-atomic>` | Extension for atomic write temp files (default: `.atomic`) |
| `--temp-ext-prevalidate` | none | `<temp-ext-prevalidate>` | Extension for validation temp files (default: `.prevalidate`) |
| `--append-newline` | none | none | Append blank line after block |
| `--attributes` | none | `<attributes>` | Set file attributes using `chattr` syntax (e.g. `+i`, `-i`, `+a`) |
| `--remove-all` | none | `<remove-all>` | Remove all blocks with specified name(s), space-separated |
| `--remove-orphans` | none | none | Remove orphaned blocks (blocks with empty content) |
| `--envsubst` | none | `<envsubst>` | Enable environment variable substitution (`true` recursive, `non-recursive`, `false`) |
| `--additive` | none | none | Ensure all input lines exist in block; add missing lines instead of replacing |
| `--additive-before` | none | `<additive-before>` | Position to add missing lines in additive mode (`regex`, `BOF`, or `EOB`/`EOF`) |
| `--additive-after` | none | `<additive-after>` | Position to add missing lines in additive mode (`regex`, `EOF`, or `EOB`) |
| `--timestamp` | none | `<timestamp>` | Add timestamp to markers (default: `epoch-nano`; options: `epoch-nano`, `epoch-sec`, `iso8601`) |
| `--tag-mode` | none | `<tag-mode>` | Tag handling: `merge` (default) or `replace` |

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
  --attributes <attributes>                              Set file attributes using chattr syntax (e.g., '+i', '-i', '+a')
  --remove-all <remove-all>                              Remove all blocks with specified name(s), space-separated
  --remove-orphans                                       Remove orphaned blocks (blocks with empty content)
  --envsubst <envsubst>                                  Enable environment variable substitution (true=recursive, non-recursive, false)
  --additive                                             Additive mode: ensure all input lines are in block, adding missing lines instead of replacing
  --additive-before <additive-before>                    Position to add missing lines in additive mode (regex, BOF for beginning of file, or EOB/EOF for end of block)
  --additive-after <additive-after>                      Position to add missing lines in additive mode (regex, EOF for end of file, or EOB for end of block)
  --timestamp <timestamp>                                Add timestamp to block markers (default: epoch-nano, options: epoch-nano, epoch-sec, iso8601)
  --tag-mode <tag-mode>                                  Tag handling strategy: merge (default) or replace. Merge preserves existing tags not being updated
```

</details>

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
