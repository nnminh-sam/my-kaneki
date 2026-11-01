/**
 * Utilities for LaTeX math normalization and symbol conversion.
 */

export const LATEX_SYMBOLS: Record<string, string> = {
  rightarrow: "→",
  to: "→",
  leftarrow: "←",
  gets: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  times: "×",
  div: "÷",
  pm: "±",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  infty: "∞",
  cdot: "·",
  checkmark: "✓",
};

/**
 * Normalizes LaTeX math expressions in markdown text:
 * 1. Preserves fenced code blocks and inline code unchanged.
 * 2. Converts display math brackets `\\[ ... \\]` to `$$ ... $$`.
 * 3. Converts inline math parens `\\( ... \\)` to `$ ... $`.
 * 4. Outside math delimiters, converts bare LaTeX symbol macros (e.g. `\\rightarrow`) to unicode.
 * 5. Leaves math expressions inside `$...$` and `$$...$$` intact for KaTeX rendering.
 */
export function normalizeLatexMath(text: string): string {
  if (!text) return "";

  // Split by code blocks and inline code spans to preserve them intact
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((chunk, i) => {
      // Odd indices are code fences or inline code
      if (i % 2 === 1) return chunk;

      // Normalize \[ ... \] to display math $$ ... $$
      chunk = chunk.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$\n${math.trim()}\n$$`);

      // Normalize \( ... \) to inline math $ ... $
      chunk = chunk.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);

      // Outside math delimiters ($$ ... $$ and $ ... $), replace bare LaTeX symbols with unicode
      const mathSplit = chunk.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
      return mathSplit
        .map((sub, j) => {
          // Inside math delimiters, keep native LaTeX intact for KaTeX
          if (j % 2 === 1) return sub;
          // Outside math delimiters, replace bare \symbol with unicode
          return sub.replace(/\\([A-Za-z]+)\b/g, (match, name) => LATEX_SYMBOLS[name] ?? match);
        })
        .join("");
    })
    .join("");
}
