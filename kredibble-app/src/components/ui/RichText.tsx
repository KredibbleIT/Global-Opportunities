import React from 'react';
import { Linking, StyleProp, Text, TextStyle, View } from 'react-native';
import { Colors } from '../../constants/design';
import { parseRichText, previewText, safeHref, type Block, type Inline } from '../../lib/rich-text';

/**
 * Shows a formatted description: headings, bold, italic, bullet and numbered lists and links (the marks are in lib/rich-text.ts).
 *
 * The text is parsed into blocks and drawn as ordinary Text, never as HTML, so nothing typed or pasted into a description can run as code. A plain
 * description with no marks looks as it was written: a blank line starts a new paragraph and a single line break stays one. Only http, https and
 * mailto links are links at all.
 *
 * `textStyle` is the screen's own body text style (size, colour, line height), so a formatted description matches the screen it is on.
 */
const HEADING_SIZE = { 1: 20, 2: 17, 3: 15 } as const;

const openLink = (href: string) => {
  const safe = safeHref(href);
  if (safe) void Linking.openURL(safe).catch(() => undefined);
};

function Inlines({ nodes }: { nodes: Inline[] }): React.ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === 'text') return node.text;
    if (node.kind === 'link') {
      return (
        <Text key={index} accessibilityRole="link" onPress={() => openLink(node.href)} style={{ color: Colors.primary, textDecorationLine: 'underline', fontWeight: '600' }}>
          <Inlines nodes={node.children} />
        </Text>
      );
    }
    return (
      <Text key={index} style={node.kind === 'bold' ? { fontWeight: '700' } : { fontStyle: 'italic' }}>
        <Inlines nodes={node.children} />
      </Text>
    );
  });
}

function BlockView({ block, textStyle }: { block: Block; textStyle?: StyleProp<TextStyle> }) {
  if (block.kind === 'heading') {
    return (
      <Text accessibilityRole="header" className="font-sans" style={[textStyle, { fontSize: HEADING_SIZE[block.level], lineHeight: HEADING_SIZE[block.level] + 6, fontWeight: '700', color: '#111827' }]}>
        <Inlines nodes={block.children} />
      </Text>
    );
  }
  if (block.kind === 'list') {
    return (
      <View style={{ gap: 4 }}>
        {block.items.map((item, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8 }}>
            <Text className="font-sans" style={[textStyle, { minWidth: 18, textAlign: 'right' }]}>{block.ordered ? `${index + 1}.` : '•'}</Text>
            <Text className="font-sans" style={[textStyle, { flex: 1 }]}>
              <Inlines nodes={item} />
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Text className="font-sans" style={textStyle}>
      <Inlines nodes={block.children} />
    </Text>
  );
}

export function RichText({ text, textStyle, testID }: { text: string; textStyle?: StyleProp<TextStyle>; testID?: string }) {
  const blocks = parseRichText(text);
  const base: StyleProp<TextStyle> = [{ fontSize: 14, lineHeight: 22, color: '#374151' }, textStyle];
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} textStyle={base} />
      ))}
    </View>
  );
}

/**
 * A description that opens and closes ("Read more"): closed it is a few lines of plain text, open it is the formatted text. (Cutting formatted text off
 * after a few lines would leave half a list or a bold mark open.)
 */
export function CollapsibleRichText({ text, expanded, collapsedLines = 3, textStyle }: { text: string; expanded: boolean; collapsedLines?: number; textStyle?: StyleProp<TextStyle> }) {
  if (expanded) return <RichText text={text} textStyle={textStyle} />;
  return (
    <Text numberOfLines={collapsedLines} className="font-sans" style={[{ fontSize: 14, lineHeight: 22, color: '#374151' }, textStyle]}>
      {previewText(text)}
    </Text>
  );
}
