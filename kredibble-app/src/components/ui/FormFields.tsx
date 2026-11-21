import React from 'react';
import { Text, TextInput, TouchableOpacity, View, type KeyboardTypeOptions } from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { Colors } from '../../constants/design';

// Small building blocks shared by the "Complete your profile" forms.

export const FieldLabel = ({ text, hint }: { text: string; hint?: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
    <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '500' }} className="font-sans">{text}</Text>
    {hint ? <Text style={{ fontSize: 12, color: '#A1A1AA' }} className="font-sans">{hint}</Text> : null}
  </View>
);

export const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }} className="font-sans">{message}</Text> : null;

const boxStyle = (error?: string) => ({
  minHeight: 52,
  borderWidth: 1,
  borderColor: error ? '#DC2626' : '#EBEBEE',
  borderRadius: 12,
  paddingHorizontal: 16,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  backgroundColor: '#FFFFFF',
});

type TextFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  testID?: string;
};

export const TextField = ({ label, hint, value, onChangeText, placeholder, keyboardType, autoCapitalize, error, multiline, maxLength, testID }: TextFieldProps) => (
  <View style={{ marginBottom: 20 }}>
    <FieldLabel text={label} hint={hint} />
    <View style={[boxStyle(error), multiline ? { alignItems: 'flex-start', paddingVertical: 12 } : null]}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A1A1AA"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        style={{ flex: 1, fontSize: 14, color: '#1A1A1A', minHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
        className="font-sans"
      />
    </View>
    <FieldError message={error} />
  </View>
);

type DropdownFieldProps = {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  error?: string;
  testID?: string;
};

/** A field that shows the chosen value and opens a picker when tapped. */
export const DropdownField = ({ label, hint, value, placeholder, onPress, error, testID }: DropdownFieldProps) => (
  <View style={{ marginBottom: 20 }}>
    <FieldLabel text={label} hint={hint} />
    <TouchableOpacity testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} style={boxStyle(error)}>
      <Text style={{ fontSize: 14, color: value ? '#1A1A1A' : '#A1A1AA', flex: 1 }} className="font-sans">{value || placeholder}</Text>
      <ChevronDown size={18} color="#A1A1AA" />
    </TouchableOpacity>
    <FieldError message={error} />
  </View>
);

/** The chosen values of a multi-select field, as removable chips under a dropdown. */
export const ChipList = ({ values, onRemove }: { values: string[]; onRemove: (value: string) => void }) =>
  values.length === 0 ? null : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8, marginBottom: 20 }}>
      {values.map((value) => (
        <View key={value} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(121, 46, 164, 0.12)', borderRadius: 16, paddingLeft: 12, paddingRight: 6, height: 32 }}>
          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }} className="font-sans">{value}</Text>
          <TouchableOpacity onPress={() => onRemove(value)} accessibilityLabel={`Remove ${value}`} style={{ padding: 6 }}>
            <X size={12} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

export const PrimaryButton = ({ label, onPress, disabled, busy, testID }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; testID?: string }) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    disabled={disabled || busy}
    accessibilityRole="button"
    style={{ height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: disabled ? Colors.primary10 : Colors.primary }}
  >
    <Text style={{ fontSize: 15, fontWeight: 'bold', color: disabled ? Colors.primary : '#FFFFFF' }} className="font-sans">{busy ? 'Saving…' : label}</Text>
  </TouchableOpacity>
);
