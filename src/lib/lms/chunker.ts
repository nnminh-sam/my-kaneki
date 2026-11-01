export interface MarkdownChunkOptions {
  maxChunkChars?: number;
  overlapChars?: number;
}

export interface MarkdownChunk {
  index: number;
  heading: string;
  breadcrumb: string[];
  content: string;
  metadata: {
    heading: string;
    breadcrumb: string[];
    charCount: number;
    hasCode: boolean;
    hasTable: boolean;
  };
}

/**
 * Splits a Markdown document into semantic chunks using heading boundaries (#, ##, ###),
 * while preserving code fences and markdown tables without breaking them mid-block.
 */
export function chunkMarkdown(
  markdown: string,
  options: MarkdownChunkOptions = {},
): MarkdownChunk[] {
  const maxChunkChars = options.maxChunkChars ?? 2000;
  const lines = markdown.split(/\r?\n/);
  const chunks: MarkdownChunk[] = [];

  // Breadcrumb hierarchy for H1, H2, H3
  const breadcrumbHierarchy: [string, string, string] = ["", "", ""];

  let currentBuffer: string[] = [];
  let inCodeFence = false;
  let codeFenceMarker = "";
  let bufferHasCode = false;
  let bufferHasTable = false;

  const getBreadcrumb = (): string[] => {
    return breadcrumbHierarchy.filter((h) => h.length > 0);
  };

  const getCurrentHeading = (): string => {
    const bc = getBreadcrumb();
    return bc.length > 0 ? bc[bc.length - 1] : "Introduction";
  };

  const flushBuffer = () => {
    const text = currentBuffer.join("\n").trim();
    if (text.length === 0) {
      currentBuffer = [];
      bufferHasCode = false;
      bufferHasTable = false;
      return;
    }

    const heading = getCurrentHeading();
    const breadcrumb = getBreadcrumb();

    chunks.push({
      index: chunks.length,
      heading,
      breadcrumb: [...breadcrumb],
      content: text,
      metadata: {
        heading,
        breadcrumb: [...breadcrumb],
        charCount: text.length,
        hasCode: bufferHasCode,
        hasTable: bufferHasTable,
      },
    });

    currentBuffer = [];
    bufferHasCode = false;
    bufferHasTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fence boundaries
    const fenceMatch = /^(```|~~~)/.exec(trimmed);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceMarker = marker;
        bufferHasCode = true;
      } else if (trimmed.startsWith(codeFenceMarker)) {
        inCodeFence = false;
        codeFenceMarker = "";
      }
      currentBuffer.push(line);
      continue;
    }

    // Inside code fence, always append as raw lines without heading splitting
    if (inCodeFence) {
      bufferHasCode = true;
      currentBuffer.push(line);
      continue;
    }

    // Check table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      bufferHasTable = true;
    }

    // Check heading outside code fence
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length; // 1, 2, or 3
      const title = headingMatch[2].trim();

      // Flush current section if non-empty
      if (currentBuffer.length > 0) {
        flushBuffer();
      }

      // Update breadcrumb hierarchy
      if (level === 1) {
        breadcrumbHierarchy[0] = title;
        breadcrumbHierarchy[1] = "";
        breadcrumbHierarchy[2] = "";
      } else if (level === 2) {
        breadcrumbHierarchy[1] = title;
        breadcrumbHierarchy[2] = "";
      } else if (level === 3) {
        breadcrumbHierarchy[2] = title;
      }

      currentBuffer.push(line);
      continue;
    }

    // Standard line
    currentBuffer.push(line);

    // If buffer exceeds maxChunkChars, flush at a safe paragraph boundary (double newline)
    const currentLen = currentBuffer.reduce((acc, l) => acc + l.length + 1, 0);
    if (currentLen >= maxChunkChars && trimmed === "") {
      flushBuffer();
    }
  }

  flushBuffer();
  return chunks;
}
