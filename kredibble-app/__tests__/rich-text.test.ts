import { applyFormat, hasRichMarks, parseInline, parseRichText, previewText, safeHref, stripRichText } from '../src/lib/rich-text';

// Formatted listing descriptions: a safe subset of Markdown. ALL DATA IS FAKE.

describe('links', () => {
  it('only opens http, https and mailto', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:jobs@example.com')).toBe('mailto:jobs@example.com');
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html;base64,AAAA', 'file:///etc/passwd', 'intent://x#Intent;end', '//example.com', 'example.com', 'https://', '']) {
      expect(safeHref(bad)).toBeNull();
    }
  });

  it('shows a link that may not be opened as the text it was typed as', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[click](javascript:alert(1))' }]);
    expect(parseInline('[apply](https://example.com/apply)')).toEqual([{ kind: 'link', href: 'https://example.com/apply', children: [{ kind: 'text', text: 'apply' }] }]);
  });
});

describe('inline marks', () => {
  it('reads bold, italic and nesting', () => {
    expect(parseInline('a **b** c *d* e')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' c ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' e' },
    ]);
    expect(parseInline('**bold and *italic* inside**')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', text: 'bold and ' }, { kind: 'italic', children: [{ kind: 'text', text: 'italic' }] }, { kind: 'text', text: ' inside' }] },
    ]);
  });

  it('leaves stray marks and sums as typed', () => {
    expect(stripRichText('2 * 3 * 4 = 24')).toBe('2 * 3 * 4 = 24');
    expect(stripRichText('** not bold **')).toBe('** not bold **');
    expect(stripRichText('a * b')).toBe('a * b');
  });

  it('shows an escaped mark as itself', () => {
    expect(stripRichText('\\*not italic\\* and \\[no link\\]')).toBe('*not italic* and [no link]');
  });

  it('never produces HTML: tags stay as plain text', () => {
    const [block] = parseRichText('<script>alert(1)</script> <b>x</b>');
    expect(block).toEqual({ kind: 'paragraph', children: [{ kind: 'text', text: '<script>alert(1)</script> <b>x</b>' }] });
  });
});

describe('blocks', () => {
  it('reads headings, paragraphs, bullets and numbered lists', () => {
    const blocks = parseRichText('## Requirements\nA degree in **any** subject.\n\n- Teamwork\n- Writing\n\n1. Apply\n2. Wait\n\nGood luck!');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'paragraph']);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('keeps a single line break, so a plain description reads as it was written', () => {
    expect(stripRichText('Line one\nLine two\n\nNew paragraph')).toBe('Line one\nLine two\nNew paragraph');
  });

  it('handles empty and Windows line endings', () => {
    expect(parseRichText('')).toEqual([]);
    expect(stripRichText('a\r\nb\r\n\r\nc')).toBe('a\nb\nc');
  });

  it('limits headings to three levels', () => {
    expect(parseRichText('#### too deep')[0].kind).toBe('paragraph');
  });
});

describe('previews', () => {
  it('drops the marks and joins the lines', () => {
    expect(previewText('## Hello\n**Apply** by [Friday](https://example.com)\n- one\n- two')).toBe('Hello Apply by Friday • one • two');
  });
});

describe('toolbar', () => {
  it('wraps the selection in bold, and takes it off again', () => {
    const bold = applyFormat('Join our team', { start: 5, end: 8 }, 'bold');
    expect(bold).toEqual({ value: 'Join **our** team', selection: { start: 7, end: 10 } });
    expect(applyFormat(bold.value, bold.selection, 'bold')).toEqual({ value: 'Join our team', selection: { start: 5, end: 8 } });
  });

  it('inserts a placeholder when nothing is selected, with the placeholder selected', () => {
    expect(applyFormat('', { start: 0, end: 0 }, 'italic')).toEqual({ value: '*italic text*', selection: { start: 1, end: 12 } });
  });

  it('makes a link and selects the address to be typed', () => {
    const result = applyFormat('Apply here', { start: 6, end: 10 }, 'link');
    expect(result.value).toBe('Apply [here](https://)');
    expect(result.value.slice(result.selection.start, result.selection.end)).toBe('https://');
  });

  it('marks every selected line as bullets, then takes them off', () => {
    const text = 'one\ntwo\nthree';
    const on = applyFormat(text, { start: 0, end: text.length }, 'bullets');
    expect(on.value).toBe('- one\n- two\n- three');
    expect(applyFormat(on.value, on.selection, 'bullets').value).toBe(text);
  });

  it('numbers the selected lines and switches between bullets and numbers', () => {
    const numbered = applyFormat('one\ntwo', { start: 0, end: 7 }, 'numbers');
    expect(numbered.value).toBe('1. one\n2. two');
    expect(applyFormat(numbered.value, numbered.selection, 'bullets').value).toBe('- one\n- two');
  });

  it('turns the line the cursor is on into a heading and back', () => {
    const heading = applyFormat('Intro\nBody', { start: 8, end: 8 }, 'heading');
    expect(heading.value).toBe('Intro\n## Body');
    expect(applyFormat(heading.value, heading.selection, 'heading').value).toBe('Intro\nBody');
  });

  it('keeps the rest of the text and blank lines when formatting a selection', () => {
    expect(applyFormat('a\n\nb', { start: 0, end: 4 }, 'bullets').value).toBe('- a\n\n- b');
  });
});

describe('plain text', () => {
  it('has no marks, so an old description is shown as it always was', () => {
    expect(hasRichMarks('Citizens of Ghana\nUnder 30 years old')).toBe(false);
    expect(hasRichMarks('2 * 3 * 4 = 24')).toBe(false);
    expect(hasRichMarks('**bold**')).toBe(true);
    expect(hasRichMarks('- one\n- two')).toBe(true);
    expect(hasRichMarks('## Heading')).toBe(true);
    expect(hasRichMarks('see [this](https://example.com)')).toBe(true);
    expect(hasRichMarks('')).toBe(false);
  });
});
