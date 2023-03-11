import { Command, EnumType } from "https://deno.land/x/cliffy@v0.25.7/command/mod.ts";

await new Command()
  .name("blockinfile")
  .version("0.1.0")
  .description("Insert & update blocks of text in file")
  .env("DEBUG=<debug:boolean>", "Enable debug output.")
  .option("-d, --debug", "Enable debug output.")
  .option("-n, --name", "Name for block", { default: "blockinfile" })
  .option("-D, --diff", "Print diff")
  .option("-i, --input", "Input file, or - for stdin", { default: "-" })
  .option("-o, --output", "Output file, or - for stdout", { default: "-" })
  .arguments("<files:string>")
  .action((options, ...args) => {})
  .parse(Deno.args);
