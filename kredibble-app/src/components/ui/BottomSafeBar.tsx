import type { ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = ViewProps;

/**
 * Keeps an absolutely positioned or in-flow bottom bar above the system navigation/home-indicator area.
 * The bar's background extends into the inset area, so it never visually collides with system chrome.
 */
export function BottomSafeBar({ children, style, ...rest }: Props) {
  return (
    <SafeAreaView {...rest} edges={['bottom']} style={style}>
      {children}
    </SafeAreaView>
  );
}
