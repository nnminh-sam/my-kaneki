export type SupportedSourceFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "markdown"
  | "text";

export interface ParserResult {
  text: string;
  format: SupportedSourceFormat | "unknown";
  warnings: string[];
}
