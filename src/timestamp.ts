import { Tag, generateTag as generateTagFromUtil } from "./tags/tags.ts";

export type TimestampFormat = "epoch-nano" | "epoch-sec" | "iso8601";

function generateTimestamp(format: TimestampFormat): string {
  const now = new Date();

  switch (format) {
    case "epoch-nano": {
      return `${now.getTime()}000000`;
    }
    case "epoch-sec": {
      return Math.floor(now.getTime() / 1000).toString();
    }
    case "iso8601": {
      return now.toISOString();
    }
    default: {
      return `${now.getTime()}000000`;
    }
  }
}

export function generateTimestampTag(format: TimestampFormat): string {
  const timestamp = generateTimestamp(format);
  return generateTagFromUtil("timestamp", timestamp);
}

export function parseTimestampFormat(value: string | undefined): TimestampFormat | undefined {
  if (!value) return undefined;

  if (value === "epoch-nano" || value === "epoch-sec" || value === "iso8601") {
    return value;
  }

  throw new Error(
    `Invalid timestamp format: ${value}. Valid options: epoch-nano, epoch-sec, iso8601`,
  );
}
