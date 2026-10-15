/**
 * CSV helpers: a small parser and writer, written here so no package is needed.
 *
 * Parsing (RFC 4180 rules):
 * - fields may be wrapped in double quotes; a doubled quote inside is one quote;
 * - commas and line breaks inside quotes belong to the field;
 * - rows end with CRLF, LF or a lone CR;
 * - a byte-order mark at the start is ignored;
 * - rows with no content at all (blank lines) are dropped.
 *
 * `parseCsv` reads the text in chunks and gives the browser a turn between chunks, so a 5 MB file with thousands of
 * rows never freezes the page. It reports progress (0 to 1) so the UI can show it.
 *
 * Writing:
 * - `toCsv` quotes what needs quoting and joins rows with CRLF (what Excel expects);
 * - `csvWithBom` puts a UTF-8 byte-order mark in front, so Excel opens accented names correctly;
 * - `escapeFormula` stops spreadsheet formula injection: a cell that starts with =, +, - or @ (or a tab or carriage
 *   return) gets a single quote in front, so Excel and Sheets read it as text and never run it.
 */

/** Characters of text handled before the parser lets the browser breathe. */
const CHUNK_CHARS = 200_000;

const BOM = "﻿";

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface ParseOptions {
  /** Called with a number from 0 to 1 as the text is read. */
  onProgress?: (fraction: number) => void;
  /** Characters per chunk (a parameter so tests can use a tiny one). */
  chunkChars?: number;
}

/** Parses CSV text into rows of cells (see the file header for the rules). */
export async function parseCsv(input: string, options: ParseOptions = {}): Promise<string[][]> {
  const chunk = options.chunkChars ?? CHUNK_CHARS;
  const text = input.startsWith(BOM) ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // A quote seen while inside quotes: it closes the field unless the next character is another quote.
  let quoteSeen = false;
  // The last character ended a row with CR: a following LF belongs to the same line break.
  let afterCr = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A line with nothing in it (one empty cell) is a blank line, not a row.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let start = 0; start < text.length; start += chunk) {
    const end = Math.min(start + chunk, text.length);
    for (let i = start; i < end; i++) {
      const ch = text[i];

      if (afterCr) {
        afterCr = false;
        if (ch === "\n") continue; // the LF of a CRLF
      }

      if (inQuotes) {
        if (quoteSeen) {
          quoteSeen = false;
          if (ch === '"') {
            field += '"'; // doubled quote
            continue;
          }
          inQuotes = false; // the quote closed the field; fall through to handle this character normally
        } else if (ch === '"') {
          quoteSeen = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }

      if (ch === '"' && field === "") {
        inQuotes = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n") {
        endRow();
      } else if (ch === "\r") {
        endRow();
        afterCr = true;
      } else {
        field += ch;
      }
    }
    options.onProgress?.(end / text.length);
    if (end < text.length) await nextTurn();
  }

  // The last row has no line break after it.
  if (field !== "" || row.length > 0 || quoteSeen) endRow();
  options.onProgress?.(1);
  return rows;
}

/** Spreadsheet formula injection guard: a leading =, +, -, @, tab or carriage return gets a single quote in front. */
export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One cell, ready for a CSV line: formula-safe, and quoted when it holds a comma, quote or line break. */
export function csvCell(value: string): string {
  const safe = escapeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows of cells to CSV text (CRLF line breaks, no trailing break). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** CSV text with a UTF-8 byte-order mark in front, so Excel reads it as UTF-8. */
export const csvWithBom = (csv: string): string => `${BOM}${csv}`;

/** Saves text as a file in the browser (an object URL on a temporary link). */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
