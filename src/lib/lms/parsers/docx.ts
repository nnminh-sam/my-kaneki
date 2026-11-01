import mammoth from "mammoth";
import type { ParserResult } from "./types";

export async function parseDocx(buffer: Buffer): Promise<ParserResult> {
  const warnings: string[] = [];
  try {
    const res = await mammoth.extractRawText({ buffer });
    if (res.messages && res.messages.length > 0) {
      for (const m of res.messages) {
        if (m.type === "warning") {
          warnings.push(m.message);
        }
      }
    }

    const text = res.value.replace(/\r\n/g, "\n").trim();
    if (!text) {
      warnings.push("Extracted empty text from DOCX.");
    }

    return {
      text,
      format: "docx",
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`DOCX parsing error: ${message}`);
    return {
      text: "",
      format: "docx",
      warnings,
    };
  }
}
