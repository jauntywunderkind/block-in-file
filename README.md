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

```
echo hello world > sample.txt
echo add this block to sample | block-in-file sample.txt
echo replace the block in sample | block-in-file sample.txt
cat sample.txt
> hello world
> # block-in-file start
> replace the block in sample
> # block-in-file end

echo output to stdout instead of sample | block-in-file sample.txt -o -
> hello world
> # block-in-file start
> output to stdout instead of sample
> # block-in-file end

echo create a new block with a new name | block-in-file sample.txt -n block2 -o -
> hello world
> # block-in-file start
> output to stdout instead of sample
> # block-in-file end
> # block2 start
> create a new block with a new name
> # block2 end

echo use before or after regexp to place blocks | block-in-file sample.txt --before '^he.*o' -o -
> # block-in-file start
> use before or after to place blocks in text
> # block-in-file end
> hello world
```

# Full Usage

```
  Usage:   blockinfile <files>
  Version: 1.0.0

  Description:

    Insert & update blocks of text in file

  Options:

    -h, --help                 - Show this help.
    -V, --version              - Show the version number for this program.
    -d, --debug                - Enable debug output.
    -n, --name      <name>     - Name for block                                                             (Default: "blockinfile")
    -c, --comment   <comment>  - Comment string for marker                                                  (Default: "#")
    --marker-end    <end>      - Marker for end                                                             (Default: "end")
    --marker-start  <start>    - Marker for start                                                           (Default: "start")
    -D, --diff      [output]   - Print diff
    --dos                      - Use dos line endings
    -i, --input     <input>    - Input file to read contents from, or - from stdout                         (Default: "-")
    -o, --output    <output>   - Output file, or - for stdout, or -- for no output, or --- for overwriting  (Default: "---")
                                  existing file
    -b, --before    <before>   - String or regex to insert before (regex or BOF for beginning of file)
    -a, --after     <after>    - String or regex to insert after (regex or EOF for end of file)
    --additive                 - Additive mode: ensure all input lines are in block, adding missing lines
                                 instead of replacing
    --additive-before <value>  Position to add missing lines in additive mode (regex, BOF for beginning of
                                 file, or EOB/EOF for end of block)
    --additive-after  <value>   Position to add missing lines in additive mode (regex, EOF for end of file,
                                 or EOB for end of block)
    --timestamp <format>        - Add timestamp to block markers (default: epoch-nano, options: epoch-nano,
                                 epoch-sec, iso8601)
```

## Tag System

Block markers support optional tags appended at the end in the format `[name:value]`. Tags are ignored when matching blocks for replacement, allowing metadata to be added without affecting block identity.

For example, with `--timestamp epoch-nano`:

```
# blockinfile start [timestamp:1770717943385000000]
content
# blockinfile end [timestamp:1770717943385000000]
```

The tags are automatically stripped when matching blocks, so updates work correctly even when timestamps or other tags change between runs. Multiple tags can be added, and custom tag types can be implemented in the future.

