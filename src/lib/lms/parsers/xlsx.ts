import * as xlsx from "xlsx";
import type { ParserResult } from "./types";

export const MAX_ROWS_PER_SHEET = 500;

function escapeCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/\r?\n/g, " ").trim();
  return s.replace(/\|/g, "\\|");
}

export function parseSpreadsheet(buffer: Buffer, isCsv = false): ParserResult {
  const warnings: string[] = [];
  try {
    const workbook = xlsx.read(buffer, { type: "buffer", raw: false });
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      warnings.push("Spreadsheet contains no sheets.");
      return { text: "", format: isCsv ? "csv" : "xlsx", warnings };
    }

    const sections: string[] = [];

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: "",
      });

      if (rows.length === 0) continue;

      if (!isCsv && sheetNames.length > 1) {
        sections.push(`### Sheet: ${name}`);
      }

      const totalRows = rows.length;
      const cappedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
      if (totalRows > MAX_ROWS_PER_SHEET) {
        warnings.push(`Sheet "${name}" was truncated from ${totalRows} rows to ${MAX_ROWS_PER_SHEET} rows.`);
      }

      // Determine column count
      let colCount = 0;
      for (const r of cappedRows) {
        if (r.length > colCount) colCount = r.length;
      }
      if (colCount === 0) continue;

      const headerRow = cappedRows[0] || [];
      const headers: string[] = [];
      for (let c = 0; c < colCount; c++) {
        headers.push(escapeCell(headerRow[c]) || `Col ${c + 1}`);
      }

      const mdTableLines: string[] = [];
      mdTableLines.push(`| ${headers.join(" | ")} |`);
      mdTableLines.push(`| ${headers.map(() => ":---").join(" | ")} |`);

      for (let r = 1; r < cappedRows.length; r++) {
        const row = cappedRows[r] || [];
        const cells: string[] = [];
        for (let c = 0; c < colCount; c++) {
          cells.push(escapeCell(row[c]));
        }
        mdTableLines.push(`| ${cells.join(" | ")} |`);
      }

      sections.push(mdTableLines.join("\n"));
    }

    const text = sections.join("\n\n").trim();
    return {
      text,
      format: isCsv ? "csv" : "xlsx",
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Spreadsheet parsing error: ${message}`);
    return {
      text: "",
      format: isCsv ? "csv" : "xlsx",
      warnings,
    };
  }
}
