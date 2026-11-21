import React, { useRef } from 'react';
import { Text, TextInput, View } from 'react-native';

interface DateOfBirthFieldProps {
  day: string;
  month: string;
  year: string;
  onChange: (next: { day: string; month: string; year: string }) => void;
  error?: string;
}

const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/**
 * Date of birth as three boxes: day, month, year. Typing is faster than scrolling a calendar back through the years, and focus moves on by
 * itself once a box is full.
 */
export function DateOfBirthField({ day, month, year, onChange, error }: DateOfBirthFieldProps) {
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const box = (flex: number) => ({
    flex,
    height: 52,
    borderWidth: 1,
    borderColor: error ? '#DC2626' : '#EBEBEE',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: '#1A1A1A',
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          testID="dob-day"
          accessibilityLabel="Day of birth"
          value={day}
          onChangeText={(text) => {
            const next = digits(text, 2);
            onChange({ day: next, month, year });
            if (next.length === 2) monthRef.current?.focus();
          }}
          placeholder="DD"
          placeholderTextColor="#A1A1AA"
          keyboardType="number-pad"
          maxLength={2}
          style={box(1) as any}
          className="font-sans"
        />
        <TextInput
          ref={monthRef}
          testID="dob-month"
          accessibilityLabel="Month of birth"
          value={month}
          onChangeText={(text) => {
            const next = digits(text, 2);
            onChange({ day, month: next, year });
            if (next.length === 2) yearRef.current?.focus();
          }}
          placeholder="MM"
          placeholderTextColor="#A1A1AA"
          keyboardType="number-pad"
          maxLength={2}
          style={box(1) as any}
          className="font-sans"
        />
        <TextInput
          ref={yearRef}
          testID="dob-year"
          accessibilityLabel="Year of birth"
          value={year}
          onChangeText={(text) => onChange({ day, month, year: digits(text, 4) })}
          placeholder="YYYY"
          placeholderTextColor="#A1A1AA"
          keyboardType="number-pad"
          maxLength={4}
          style={box(1.6) as any}
          className="font-sans"
        />
      </View>
      {error ? (
        <Text style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }} className="font-sans">{error}</Text>
      ) : null}
    </View>
  );
}
