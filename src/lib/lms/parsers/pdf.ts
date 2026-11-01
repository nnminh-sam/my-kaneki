import { extractText } from "unpdf";
import type { ParserResult } from "./types";

export async function parsePdf(buffer: Buffer): Promise<ParserResult> {
  const warnings: string[] = [];
  try {
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8);
    const pages = result.text ?? [];
    const textContent = Array.isArray(pages) ? pages.join("\n\n") : String(pages);

    if (!textContent.trim()) {
      warnings.push("Extracted empty text from PDF. The document may contain only scanned images or be encrypted.");
    }

    return {
      text: textContent,
      format: "pdf",
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`PDF parsing error: ${message}`);
    return {
      text: "",
      format: "pdf",
      warnings,
    };
  }
}
