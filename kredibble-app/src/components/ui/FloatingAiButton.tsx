import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { Colors } from '../../constants/design';

/** Size of the button, so a screen can leave enough room under its content for it. */
export const FLOATING_AI_BUTTON_SIZE = 58;

/**
 * The AI Smart assistant, as a button that floats at the bottom right of a screen. Place it as the last child of the screen's container
 * (the container must fill the screen) and keep the scrolling content's bottom padding at least FLOATING_AI_BUTTON_SIZE + 40.
 */
export function FloatingAiButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      testID="floating-ai-button"
      accessibilityRole="button"
      accessibilityLabel="AI Smart assistant"
      activeOpacity={0.85}
      onPress={() => router.push('/assistant' as never)}
      style={{
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: FLOATING_AI_BUTTON_SIZE,
        height: FLOATING_AI_BUTTON_SIZE,
        borderRadius: FLOATING_AI_BUTTON_SIZE / 2,
        backgroundColor: Colors.primary,
        borderWidth: 3,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}
    >
      <Sparkles size={26} color="#FFFFFF" />
    </TouchableOpacity>
  );
}
