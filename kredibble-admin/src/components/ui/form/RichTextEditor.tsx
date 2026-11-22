"use client";

/**
 * RichTextEditor: a text box for a formatted description. Put it inside a <Field>.
 *
 *   [ B ] [ I ] [ H ] [ • ] [ 1. ] [ link ]
 *   the text, already formatted as it is typed
 *
 * What is typed shows formatted straight away: bold words are bold, italic words are italic, a heading is larger, a link is coloured. Select some
 * text and press a button, or press it with nothing selected to start a new one; pressing it again takes the format off. Ctrl+B and Ctrl+I work too.
 * There is no preview to open, and the ** and ## marks are not shown.
 *
 * Under the formatting the value is still the plain text of lib/rich-text.ts (**bold**, *italic*, ## heading, "- " bullets, "1. " numbers,
 * [text](address)), so it is saved and read back exactly as before and plain text keeps working. The marks are in the text but hidden (zero size);
 * the cursor and the selection are measured in characters of that text, so they land in the right place.
 *
 * Props: value, onChange(text), onBlur, rows (starting height), placeholder
 */
import { useLayoutEffect, useRef } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { applyFormat, type FormatAction, type Selection } from "@/lib/rich-text";
import { CONTROL_CLASSES, useFieldControlProps, useFieldLabelId } from "./Field";

const ACTIONS: { action: FormatAction; label: string; icon: LucideIcon }[] = [
  { action: "bold", label: "Bold", icon: Bold },
  { action: "italic", label: "Italic", icon: Italic },
  { action: "heading", label: "Heading", icon: Heading2 },
  { action: "bullets", label: "Bulleted list", icon: List },
  { action: "numbers", label: "Numbered list", icon: ListOrdered },
  { action: "link", label: "Link", icon: Link2 },
];

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// A mark that is in the text but takes no room: zero size, so it cannot be seen or take any width.
const mark = (text: string) => `<span style="font-size:0">${escapeHtml(text)}</span>`;
const INLINE = /(\*\*[^\s*](?:[^*\n]*[^\s*])?\*\*|\*[^\s*](?:[^*\n]*[^\s*])?\*|\[[^\]\n]+\]\([^)\n]+\))/g;

function inlineHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const piece = match[0];
    const at = match.index ?? 0;
    out += escapeHtml(text.slice(last, at));
    if (piece.startsWith("**")) out += `${mark("**")}<strong>${escapeHtml(piece.slice(2, -2))}</strong>${mark("**")}`;
    else if (piece.startsWith("*")) out += `${mark("*")}<em>${escapeHtml(piece.slice(1, -1))}</em>${mark("*")}`;
    else {
      const close = piece.indexOf("](");
      out += `${mark("[")}<span class="text-purple-700 underline">${escapeHtml(piece.slice(1, close))}</span><span class="text-muted text-xs">${escapeHtml(piece.slice(close))}</span>`;
    }
    last = at + piece.length;
  }
  return out + escapeHtml(text.slice(last));
}

/** The text as formatted HTML. Every character of the text is in it once, in order, so offsets in the text and in the page agree. */
function toHtml(value: string): string {
  const lines = value.split("\n").map((line) => {
    const heading = /^(#{1,3} )(.*)$/.exec(line);
    if (heading) return `${mark(heading[1])}<span style="font-size:1.25rem;line-height:1.75rem;font-weight:700">${inlineHtml(heading[2])}</span>`;
    const list = /^(\s*(?:[-*•] |\d+[.)] ))(.*)$/.exec(line);
    if (list) return `<span class="text-muted">${escapeHtml(list[1])}</span>${inlineHtml(list[2])}`;
    return inlineHtml(line);
  });
  // A final line break needs something after it to be shown; the <br> adds no text.
  return lines.join("\n") + (value.endsWith("\n") ? "<br>" : "");
}

/** Where the cursor or selection is, as character offsets into the text. */
function getOffsets(root: HTMLElement): Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

function setOffsets(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  range.setStart(root, 0);
  range.collapse(true);
  let seen = 0;
  let startSet = false;
  let endSet = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!startSet && start <= seen + length) {
      range.setStart(node, start - seen);
      startSet = true;
    }
    if (startSet && end <= seen + length) {
      range.setEnd(node, end - seen);
      endSet = true;
      break;
    }
    seen += length;
  }
  if (!startSet) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else if (!endSet) {
    range.setEnd(root, root.childNodes.length);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  rows?: number;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, onBlur, rows = 8, placeholder }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const fieldProps = useFieldControlProps();
  const labelId = useFieldLabelId();

  // The text changed from outside (the form was reset or loaded): show it formatted, and keep the cursor where it was.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || box.textContent === value) return;
    const had = document.activeElement === box ? getOffsets(box) : null;
    box.innerHTML = toHtml(value);
    if (had) setOffsets(box, had.start, had.end);
  }, [value]);

  const refresh = () => {
    const box = ref.current;
    if (!box) return;
    const text = box.textContent ?? "";
    const html = toHtml(text);
    // Typing into text that is already shown the right way needs no repaint (which would also clear the browser's undo history).
    if (box.innerHTML !== html) {
      const at = getOffsets(box);
      box.innerHTML = html;
      if (at) setOffsets(box, at.start, at.end);
    }
    onChange(text);
  };

  const apply = (action: FormatAction) => {
    const box = ref.current;
    if (!box) return;
    box.focus();
    const text = box.textContent ?? "";
    const at = getOffsets(box) ?? { start: text.length, end: text.length };
    const result = applyFormat(text, at, action);
    box.innerHTML = toHtml(result.value);
    setOffsets(box, result.selection.start, result.selection.end);
    onChange(result.value);
  };

  const button = "inline-flex size-10 items-center justify-center rounded-control text-ink transition-colors hover:bg-neutral-soft focus-visible:outline-2 focus-visible:outline-purple-600";

  return (
    <div data-testid="rich-text-editor">
      <div role="toolbar" aria-label="Text formatting" className="mb-2 flex flex-wrap items-center gap-1">
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            data-testid={`format-${action}`}
            aria-label={label}
            title={label}
            // Keep the cursor and the selection in the text while a button is pressed.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(action)}
            className={button}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        {...fieldProps}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        style={{ minHeight: rows * 20 + 20 }}
        className={cn(CONTROL_CLASSES, "h-auto resize-y overflow-auto whitespace-pre-wrap break-words py-2.5 empty:before:text-muted empty:before:content-[attr(data-placeholder)]")}
        onInput={() => {
          if (!composing.current) refresh();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          refresh();
        }}
        onBlur={onBlur}
        onKeyDown={(event) => {
          // Enter is handled here: the browser's own Enter adds an extra hidden line break at the end of the text.
          if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !composing.current) {
            event.preventDefault();
            const box = ref.current;
            if (!box) return;
            const text = box.textContent ?? "";
            const at = getOffsets(box) ?? { start: text.length, end: text.length };
            const next = text.slice(0, at.start) + "\n" + text.slice(at.end);
            box.innerHTML = toHtml(next);
            setOffsets(box, at.start + 1, at.start + 1);
            onChange(next);
            return;
          }
          if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i") {
            event.preventDefault();
            apply(key === "b" ? "bold" : "italic");
          }
        }}
      />
    </div>
  );
}
