export interface CitationValidationResult {
  valid: boolean;
  defects: string[];
  referencedIndices: number[];
}

/**
 * Validates citation integrity in a research draft:
 * 1. Checks that citations array is non-empty.
 * 2. Checks that every citation entry is non-empty and well-formed.
 * 3. Identifies [n] citation references in the Markdown content and verifies
 *    that each referenced index exists in the citations list (1-based index).
 * 4. Checks for duplicate URLs in citations.
 */
export function validateCitations(
  markdown: string,
  citations: string[],
): CitationValidationResult {
  const defects: string[] = [];
  const referencedIndices: number[] = [];

  if (!citations || citations.length === 0) {
    defects.push("No source citations provided.");
    return { valid: false, defects, referencedIndices };
  }

  // 1. Validate citation entries and check duplicate URLs
  const seenUrls = new Set<string>();
  for (let i = 0; i < citations.length; i++) {
    const cit = citations[i]?.trim();
    if (!cit) {
      defects.push(`Citation [${i + 1}] is empty.`);
      continue;
    }

    // Extract URL if present
    const urlMatch = /https?:\/\/[^\s)\]]+/i.exec(cit);
    if (urlMatch) {
      const url = urlMatch[0].toLowerCase();
      try {
        new URL(url);
        if (seenUrls.has(url)) {
          defects.push(`Duplicate citation URL detected: ${urlMatch[0]}`);
        } else {
          seenUrls.add(url);
        }
      } catch {
        defects.push(`Malformed URL in citation [${i + 1}]: ${urlMatch[0]}`);
      }
    }
  }

  // 2. Identify [n] references in markdown (e.g. [1], [2], [12])
  // Exclude markdown links like [text](url)
  const regex = /\[(\d+)\](?!\()/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const idx = parseInt(match[1], 10);
    if (!referencedIndices.includes(idx)) {
      referencedIndices.push(idx);
    }
  }

  for (const idx of referencedIndices) {
    if (idx < 1 || idx > citations.length) {
      defects.push(
        `Markdown references citation [${idx}], but citations list only contains ${citations.length} item(s).`,
      );
    }
  }

  return {
    valid: defects.length === 0,
    defects,
    referencedIndices,
  };
}
