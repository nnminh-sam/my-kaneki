import type { ParserResult } from "./types";

export function parseMarkdown(buffer: Buffer, isText = false): ParserResult {
  const content = buffer.toString("utf-8").replace(/\r\n/g, "\n");
  return {
    text: content,
    format: isText ? "text" : "markdown",
    warnings: [],
  };
}
