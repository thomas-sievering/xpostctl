/**
 * Terminal color palette — muted tones for readable, non-aggressive output.
 * Uses 24-bit ANSI (truecolor) escape sequences. No dependencies.
 */

const esc = (code: string) => `\x1b[${code}m`;
const RESET = esc("0");

const wrap = (code: string) => (text: string) => `${esc(code)}${text}${RESET}`;

/** Section header: ── Title ──────────────── */
export function section(title: string): string {
  const fill = "─".repeat(Math.max(0, 46 - title.length));
  return `${c.dim("──")} ${c.title(title)} ${c.dim(fill)}`;
}

/** Word-wrap plain text, prefixing every line with `indent` */
export function wrapText(text: string, indent: string, width?: number): string {
  const cols = width ?? (process.stdout.columns || 100);
  const maxLen = Math.max(20, cols - indent.length);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let current = "";
    for (const word of words) {
      if (current && current.length + 1 + word.length > maxLen) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.map((l) => indent + l).join("\n");
}

export const c = {
  // --- semantic ---
  ok: wrap("38;2;108;153;108"),     // sage green
  warn: wrap("38;2;194;158;76"),    // dusty amber
  error: wrap("38;2;174;90;90"),    // dusty rose

  // --- ui ---
  title: wrap("38;2;140;160;185"),  // steel blue
  label: wrap("38;2;160;165;175"),  // cool gray
  muted: wrap("38;2;100;100;110"),  // dim gray
  dim: wrap("38;2;72;72;82"),       // near-invisible
  bold: wrap("1"),                  // terminal bold

  reset: RESET,
};
