export type CreateArg = boolean | 0 | 1 | "file" | "block";

export interface InputOptions {
  create?: boolean;
}

export interface BlockInFileOptions {
  after?: string | RegExp | boolean;
  before?: string | RegExp | boolean;
  comment: string;
  create?: CreateArg;
  debug?: boolean;
  diff?: string | boolean;
  dos?: boolean;
  input?: string;
  markerStart: string;
  markerEnd: string;
  name: string;
  output?: string;
}

export interface ParseResult {
  outputs: string[];
  matched: number;
  opened?: number;
}
