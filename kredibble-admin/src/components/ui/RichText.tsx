"use client";

/**
 * RichText: shows a formatted description (headings, bold, italic, bullet and numbered lists, links; see lib/rich-text.ts for the marks).
 *
 * The text is parsed into blocks and drawn as ordinary elements, never as HTML, so nothing typed or pasted into a description can run as code.
 * A plain description with no marks looks as it was written: a blank line starts a new paragraph and a single line break stays one.
 * Links open in a new tab, and only http, https and mailto links are links at all.
 *
 * Props: text (the stored description), className (layout only), testId
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseRichText, type Block, type Inline } from "@/lib/rich-text";

function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === "text") return <Fragment key={index}>{node.text}</Fragment>;
    if (node.kind === "link") {
      return (
        <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 underline underline-offset-2 hover:text-purple-800">
          <Inlines nodes={node.children} />
        </a>
      );
    }
    if (node.kind === "bold") return <strong key={index} className="font-semibold"><Inlines nodes={node.children} /></strong>;
    return <em key={index}><Inlines nodes={node.children} /></em>;
  });
}

const HEADING_CLASSES = { 1: "text-xl leading-7", 2: "text-lg leading-6", 3: "text-base leading-6" } as const;

function BlockView({ block }: { block: Block }) {
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h4" : block.level === 2 ? "h5" : "h6";
    return <Tag className={cn("font-display font-semibold text-ink", HEADING_CLASSES[block.level])}><Inlines nodes={block.children} /></Tag>;
  }
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List className={cn("space-y-1 pl-6", block.ordered ? "list-decimal" : "list-disc")}>
        {block.items.map((item, index) => (
          <li key={index}><Inlines nodes={item} /></li>
        ))}
      </List>
    );
  }
  return <p className="whitespace-pre-line"><Inlines nodes={block.children} /></p>;
}

export function RichText({ text, className, testId }: { text: string; className?: string; testId?: string }) {
  const blocks = parseRichText(text);
  return (
    <div data-testid={testId} className={cn("input-text space-y-3 break-words text-ink", className)}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
