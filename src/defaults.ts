import type { BlockInFileOptions } from "./types.ts";

const defaultOptions: Readonly<BlockInFileOptions> = Object.freeze({
  after: undefined,
  before: undefined,
  comment: "#",
  create: false,
  debug: false,
  diff: undefined,
  dos: false,
  envsubst: false,
  input: undefined,
  markerStart: "start",
  markerEnd: "end",
  name: "blockinfile",
  output: undefined,
});

export function getDefaultOptions(): BlockInFileOptions {
  return { ...defaultOptions };
}

export { defaultOptions };
