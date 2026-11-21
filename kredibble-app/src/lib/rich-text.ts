// Formatted text for listing descriptions: a small, safe subset of Markdown. The text is stored as plain text with these marks, so an old, unformatted
// description still reads exactly as written. It is NEVER turned into HTML: it is parsed into blocks and shown as text, so nothing typed or pasted
// here can run as code.
//
//   # Heading   ## Smaller heading   ### Smallest heading     (a line that starts with 1 to 3 "#" and a space)
//   **bold**   *italic*   [link text](https://example.com)     (links open only for http, https and mailto)
//   - bullet item                                              (a line that starts with "-", "*" or "•" and a space)
//   1. numbered item                                           (a line that starts with a number, a "." or ")" and a space)
//   A blank line starts a new paragraph; a single line break stays a line break.
//   \* a backslash in front of * _ [ ] ( ) # - ` shows that mark as it is.
//
// This file is the same in kredibble-app and kredibble-admin (src/lib/rich-text.ts). Change both together.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] };

/** The address of a link, or null when it is not one that may be opened (only http, https and mailto are). */
export const safeHref = (value: string): string | null => {
  const url = value.trim();
  return /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(url) ? url : null;
};

// Escapes, **bold**, *italic*, [text](address). A mark has to touch its text ("** x **" is not bold), so a stray "*" or a sum like 2 * 3 * 4 stays as typed.
const INLINE_SOURCE = /\\([\\*\[\]()#\-_`])|\*\*([^\s*](?:[\s\S]*?\S)?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/.source;

export const parseInline = (source: string): Inline[] => {
  const nodes: Inline[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const previous = nodes[nodes.length - 1];
    if (previous?.kind === 'text') previous.text += text;
    else nodes.push({ kind: 'text', text });
  };
  // A regex of its own for each call: the children are parsed inside this loop, and a shared global regex would lose its place.
  const inline = new RegExp(INLINE_SOURCE, 'g');
  for (let match = inline.exec(source); match; match = inline.exec(source)) {
    pushText(source.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1] !== undefined) pushText(match[1]);
    else if (match[2] !== undefined) nodes.push({ kind: 'bold', children: parseInline(match[2]) });
    else if (match[3] !== undefined) nodes.push({ kind: 'italic', children: parseInline(match[3]) });
    else {
      const href = safeHref(match[5]);
      if (href) nodes.push({ kind: 'link', href, children: parseInline(match[4]) });
      else pushText(match[0]); // not an address that may be opened: shown as typed
    }
  }
  pushText(source.slice(last));
  return nodes;
};

const HEADING = /^\s{0,3}(#{1,3})\s+(.*\S)\s*$/;
const BULLET = /^\s*[-*•]\s+(.*\S)\s*$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*\S)\s*$/;

export const parseRichText = (source: string): Block[] => {
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const text = (bullet ?? numbered)![1];
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(parseInline(text));
      else blocks.push({ kind: 'list', ordered, items: [parseInline(text)] });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
};

const inlineText = (nodes: Inline[]): string => nodes.map((node) => (node.kind === 'text' ? node.text : inlineText(node.children))).join('');

/** The text without its marks, for a short preview, a search or a share: "**Apply** by [Friday](https://x.org)" becomes "Apply by Friday". */
export const stripRichText = (source: string): string =>
  parseRichText(source)
    .map((block) => {
      if (block.kind === 'list') return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${inlineText(item)}`).join('\n');
      return inlineText(block.children);
    })
    .join('\n');

/** True when the text uses any mark (a heading, a list, bold, italic or a link). Plain text has none and is shown as it always was. */
export const hasRichMarks = (source: string): boolean =>
  parseRichText(source).some((block) => block.kind !== 'paragraph' || block.children.some((node) => node.kind !== 'text'));

/** One line of plain text for a card preview. */
export const previewText = (source: string): string => stripRichText(source).replace(/\s+/g, ' ').trim();

// ─── Formatting from a toolbar ────────────────────────────────────────────────

export type FormatAction = 'bold' | 'italic' | 'heading' | 'bullets' | 'numbers' | 'link';
export type Selection = { start: number; end: number };
export type FormatResult = { value: string; selection: Selection };

const wrap = (value: string, { start, end }: Selection, mark: string, placeholder: string): FormatResult => {
  const before = value.slice(0, start);
  const chosen = value.slice(start, end);
  const after = value.slice(end);
  // Already wrapped, so the same button takes the marks off again.
  if (chosen && before.endsWith(mark) && after.startsWith(mark)) {
    return { value: before.slice(0, -mark.length) + chosen + after.slice(mark.length), selection: { start: start - mark.length, end: end - mark.length } };
  }
  if (chosen.startsWith(mark) && chosen.endsWith(mark) && chosen.length > mark.length * 2) {
    const inner = chosen.slice(mark.length, -mark.length);
    return { value: before + inner + after, selection: { start, end: start + inner.length } };
  }
  const text = chosen || placeholder;
  return { value: `${before}${mark}${text}${mark}${after}`, selection: { start: start + mark.length, end: start + mark.length + text.length } };
};

/** Applies the line-based formats (heading, bullets, numbers) to every line the selection touches. */
const lineFormat = (value: string, { start, end }: Selection, action: 'heading' | 'bullets' | 'numbers'): FormatResult => {
  const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextBreak = value.indexOf('\n', end);
  const to = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(from, to).split('\n');
  const marks: Record<typeof action, RegExp> = { heading: /^#{1,3}\s+/, bullets: /^\s*[-*•]\s+/, numbers: /^\s*\d{1,3}[.)]\s+/ };
  const content = lines.filter((line) => line.trim());
  const allMarked = content.length > 0 && content.every((line) => marks[action].test(line));
  const stripAny = (line: string) => line.replace(/^#{1,3}\s+/, '').replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d{1,3}[.)]\s+/, '');
  let counter = 0;
  const changed = lines.map((line) => {
    if (!line.trim()) return line;
    if (allMarked) return line.replace(marks[action], '');
    const plain = stripAny(line);
    if (action === 'heading') return `## ${plain}`;
    if (action === 'bullets') return `- ${plain}`;
    counter += 1;
    return `${counter}. ${plain}`;
  });
  const text = changed.join('\n');
  const changedValue = value.slice(0, from) + text + value.slice(to);
  // With just a cursor in the line, the cursor stays at the end of it so typing carries on; with a selection, the lines stay selected so the button can undo them.
  const caret = from + text.length;
  return { value: changedValue, selection: start === end ? { start: caret, end: caret } : { start: from, end: caret } };
};

/** What a toolbar button does to the text: wraps or unwraps the selection, or marks the lines it touches. */
export const applyFormat = (value: string, selection: Selection, action: FormatAction): FormatResult => {
  const safe: Selection = { start: Math.max(0, Math.min(selection.start, selection.end)), end: Math.min(value.length, Math.max(selection.start, selection.end)) };
  if (action === 'bold') return wrap(value, safe, '**', 'bold text');
  if (action === 'italic') return wrap(value, safe, '*', 'italic text');
  if (action === 'link') {
    const chosen = value.slice(safe.start, safe.end) || 'link text';
    const insert = `[${chosen}](https://)`;
    const urlStart = safe.start + chosen.length + 3;
    return { value: value.slice(0, safe.start) + insert + value.slice(safe.end), selection: { start: urlStart, end: urlStart + 'https://'.length } };
  }
  return lineFormat(value, safe, action);
};
