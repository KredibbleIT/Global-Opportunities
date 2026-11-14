import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import LogoIntro, { LOGO_INTRO_DURATION } from '../components/ui/LogoIntro';
import { authStore } from '../constants/authStore';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { restoreStartupSession } from '../lib/session-restore';

// Let the finished logo rest for a moment before moving on.
const HOLD_MS = 400;

/**
 * Launch screen: plays the logo, then opens onboarding (first launch), the app
 * (a remembered session, SEC-160) or sign-in.
 */
export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const chooseStartScreen = async () => {
      const minimumShown = new Promise<void>(resolve => setTimeout(resolve, LOGO_INTRO_DURATION + HOLD_MS));
      let target = '/(auth)/login';
      try {
        const hasSeenOnboarding = await SecureStore.getItemAsync('hasSeenOnboarding');
        if (hasSeenOnboarding !== 'true') {
          target = '/(onboarding)/1';
        } else {
          // Runs while the logo plays, so a remembered person rarely waits longer than before.
          const session = await restoreStartupSession();
          if (session.status === 'signed-in' && !cancelled) {
            authStore.setSession(session.token, session.user);
            authStore.setRole(session.user.role === 'hirer' ? 'hirer' : 'seeker');
            target = '/(tabs)';
            // SEC-138: a returning person's phone may have a new push token; sign-in registers it otherwise.
            registerForPushNotificationsAsync().catch(() => {
              // Non-blocking in dev/simulators
            });
          }
        }
      } catch {
        // Fallback to sign-in if storage fails
      }
      await minimumShown;
      if (!cancelled) router.replace(target as any);
    };

    chooseStartScreen();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F9', justifyContent: 'center', alignItems: 'center' }}>
      <StatusBar style="dark" />
      <LogoIntro />
    </View>
  );
}
