import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";
import { extractFileContent, detectFormatFromFilename } from "./index";

describe("LMS In-Memory Document Parsers", () => {
  it("detects format accurately from extension", () => {
    assert.equal(detectFormatFromFilename("paper.pdf"), "pdf");
    assert.equal(detectFormatFromFilename("spec.docx"), "docx");
    assert.equal(detectFormatFromFilename("data.xlsx"), "xlsx");
    assert.equal(detectFormatFromFilename("table.csv"), "csv");
    assert.equal(detectFormatFromFilename("notes.md"), "markdown");
    assert.equal(detectFormatFromFilename("readme.txt"), "text");
    assert.equal(detectFormatFromFilename("image.png"), "unknown");
  });

  it("extracts Markdown and Text directly without modification", async () => {
    const rawMd = "# Header\n\nSome paragraph.\n- Item 1\n- Item 2";
    const res = await extractFileContent(Buffer.from(rawMd, "utf-8"), "test.md");
    assert.equal(res.format, "markdown");
    assert.equal(res.text, rawMd);
    assert.equal(res.warnings.length, 0);
  });

  it("converts CSV to clean Markdown table with escaped pipes", async () => {
    const csv = "Name,Metric,Note\nAlg A,120,Normal\nAlg B,340,Pipe | test";
    const res = await extractFileContent(Buffer.from(csv, "utf-8"), "data.csv");
    assert.equal(res.format, "csv");
    assert.ok(res.text.includes("| Name | Metric | Note |"));
    assert.ok(res.text.includes("| Alg A | 120 | Normal |"));
    assert.ok(res.text.includes("Pipe \\| test"));
  });

  it("converts XLSX workbook sheets into Markdown tables", async () => {
    const wb = xlsx.utils.book_new();
    const wsData = [
      ["Benchmark", "Throughput", "Latency"],
      ["Raft", "15000", "2.1ms"],
      ["Paxos", "14800", "2.3ms"],
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, "Benchmarks");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const res = await extractFileContent(buf, "metrics.xlsx");

    assert.equal(res.format, "xlsx");
    assert.ok(res.text.includes("| Benchmark | Throughput | Latency |"));
    assert.ok(res.text.includes("| Raft | 15000 | 2.1ms |"));
  });

  it("gracefully returns warnings on malformed DOCX / PDF buffers without throwing", async () => {
    const malformed = Buffer.from("Not a real binary file", "utf-8");
    const docxRes = await extractFileContent(malformed, "corrupt.docx");
    assert.equal(docxRes.format, "docx");
    assert.ok(docxRes.warnings.length > 0);

    const pdfRes = await extractFileContent(malformed, "corrupt.pdf");
    assert.equal(pdfRes.format, "pdf");
    assert.ok(pdfRes.warnings.length > 0);
  });

  it("returns warning for unsupported file extension", async () => {
    const res = await extractFileContent(Buffer.from("abc"), "script.py");
    assert.equal(res.format, "unknown");
    assert.ok(res.warnings[0].includes("Unsupported file extension"));
  });
});
