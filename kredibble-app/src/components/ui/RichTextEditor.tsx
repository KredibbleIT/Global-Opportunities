import React, { useMemo, useState } from 'react';
import { NativeSyntheticEvent, Text, TextInput, TextInputSelectionChangeEventData, TouchableOpacity, View } from 'react-native';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, type LucideIcon } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { applyFormat, type FormatAction, type Selection } from '../../lib/rich-text';

const ACTIONS: { action: FormatAction; label: string; icon: LucideIcon }[] = [
  { action: 'bold', label: 'Bold', icon: Bold },
  { action: 'italic', label: 'Italic', icon: Italic },
  { action: 'heading', label: 'Heading', icon: Heading2 },
  { action: 'bullets', label: 'Bulleted list', icon: List },
  { action: 'numbers', label: 'Numbered list', icon: ListOrdered },
  { action: 'link', label: 'Link', icon: Link2 },
];

// A mark that is in the text but takes no room or colour: tiny and see-through, so the ** and ## are not seen.
const HIDDEN = { fontSize: 1, color: 'transparent' } as const;
const DIM = { color: '#B8BBC8' } as const;
const INLINE = /(\*\*[^\s*](?:[^*]*[^\s*])?\*\*|\*[^\s*](?:[^*]*[^\s*])?\*|\[[^\]\n]+\]\([^)\n]+\))/g;

/**
 * The text as styled pieces, so a format shows on the words the moment it is applied: bold looks bold, italic looks italic, a heading is larger and
 * a link is coloured. The marks themselves (** * ## [) stay in the text but are hidden, so what is stored is exactly what is typed and the cursor
 * never jumps. Every character of the value is rendered once, in order.
 */
function styledPieces(value: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let key = 0;
  const lines = value.split('\n');
  lines.forEach((line, lineIndex) => {
    const heading = /^(#{1,3} )(.*)$/.exec(line);
    const list = /^(\s*(?:[-*•] |\d+[.)] ))(.*)$/.exec(line);
    const prefix = heading ? heading[1] : list ? list[1] : '';
    const rest = line.slice(prefix.length);
    const lineStyle = heading ? { fontSize: 18, fontWeight: '700' as const } : undefined;
    if (prefix) out.push(<Text key={key++} style={heading ? HIDDEN : DIM}>{prefix}</Text>);
    let last = 0;
    const pieces: React.ReactNode[] = [];
    for (const match of rest.matchAll(INLINE)) {
      const text = match[0];
      const at = match.index ?? 0;
      if (at > last) pieces.push(rest.slice(last, at));
      if (text.startsWith('**')) {
        pieces.push(<Text key={key++} style={HIDDEN}>**</Text>, <Text key={key++} style={{ fontWeight: '700' }}>{text.slice(2, -2)}</Text>, <Text key={key++} style={HIDDEN}>**</Text>);
      } else if (text.startsWith('*')) {
        pieces.push(<Text key={key++} style={HIDDEN}>*</Text>, <Text key={key++} style={{ fontStyle: 'italic' }}>{text.slice(1, -1)}</Text>, <Text key={key++} style={HIDDEN}>*</Text>);
      } else {
        const close = text.indexOf('](');
        pieces.push(
          <Text key={key++} style={HIDDEN}>[</Text>,
          <Text key={key++} style={{ color: Colors.primary, textDecorationLine: 'underline' }}>{text.slice(1, close)}</Text>,
          <Text key={key++} style={{ ...DIM, fontSize: 11 }}>{text.slice(close)}</Text>,
        );
      }
      last = at + text.length;
    }
    if (last < rest.length) pieces.push(rest.slice(last));
    out.push(lineStyle ? <Text key={key++} style={lineStyle}>{pieces}</Text> : <React.Fragment key={key++}>{pieces}</React.Fragment>);
    if (lineIndex < lines.length - 1) out.push('\n');
  });
  return out;
}

type RichTextEditorProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Height of the writing box. */
  minHeight?: number;
  testID?: string;
};

/**
 * A text box for a formatted description, with a toolbar: bold, italic, heading, bulleted and numbered lists and a link. Select some text and tap a
 * button, or tap it with nothing selected to start a new one; tapping again takes the format off. The marks it writes are the ones in
 * lib/rich-text.ts, and the text is formatted in the box as it is typed (no Preview to open). Plain text still works: the marks are optional.
 */
export function RichTextEditor({ value, onChangeText, placeholder, minHeight = 160, testID }: RichTextEditorProps) {
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  // Only set while a toolbar button has just moved the selection: the box is told where to put the cursor, then left alone while typing.
  const [forced, setForced] = useState<Selection | undefined>(undefined);

  const apply = (action: FormatAction) => {
    const result = applyFormat(value, selection, action);
    setSelection(result.selection);
    setForced(result.selection);
    onChangeText(result.value);
  };

  const pieces = useMemo(() => styledPieces(value), [value]);

  const onSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
    setForced(undefined);
  };

  return (
    <View testID={testID}>
      <View accessibilityRole="toolbar" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <TouchableOpacity
            key={action}
            testID={`format-${action}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => apply(action)}
            style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}
          >
            <Icon size={18} color="#111827" />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        testID={testID ? `${testID}-input` : undefined}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
        selection={forced}
        multiline
        placeholder={placeholder}
        placeholderTextColor="#A1A1AA"
        textAlignVertical="top"
        style={{ minHeight, borderWidth: 1, borderColor: '#EBEBEE', borderRadius: 12, padding: 14, fontSize: 14, color: '#1A1A1A', backgroundColor: '#FFFFFF' }}
        className="font-sans"
      >
        {pieces}
      </TextInput>
    </View>
  );
}
