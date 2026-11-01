import path from "node:path";
import type { ParserResult, SupportedSourceFormat } from "./types";
import { parseMarkdown } from "./markdown";
import { parsePdf } from "./pdf";
import { parseDocx } from "./docx";
import { parseSpreadsheet } from "./xlsx";

export * from "./types";

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Detects format from filename extension.
 */
export function detectFormatFromFilename(filename: string): SupportedSourceFormat | "unknown" {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown":
      return "markdown";
    case ".txt":
      return "text";
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".xlsx":
    case ".xls":
      return "xlsx";
    case ".csv":
      return "csv";
    default:
      return "unknown";
  }
}

/**
 * Extracts text in-memory from a supported file buffer.
 * If the file is not supported or exceeds size, returns typed warnings/errors.
 */
export async function extractFileContent(
  buffer: Buffer,
  filename: string,
): Promise<ParserResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      text: "",
      format: "unknown",
      warnings: [`File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit of 50MB.`],
    };
  }

  const format = detectFormatFromFilename(filename);

  switch (format) {
    case "markdown":
      return parseMarkdown(buffer, false);
    case "text":
      return parseMarkdown(buffer, true);
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
      return parseSpreadsheet(buffer, false);
    case "csv":
      return parseSpreadsheet(buffer, true);
    default:
      return {
        text: "",
        format: "unknown",
        warnings: [`Unsupported file extension for "${filename}". Supported formats: .pdf, .docx, .xlsx, .csv, .md, .txt.`],
      };
  }
}
