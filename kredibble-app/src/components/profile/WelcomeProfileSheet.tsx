import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { hasSeenWelcome, markWelcomeSeen, needsProfileWork } from '../../lib/profile-prompts';
import { CompletionBar } from './ProfileCompletionCard';

/**
 * A short welcome the first time someone is on Home with a profile that still has things to fill in. It shows once per person on this phone:
 * "Complete my profile" takes them to the checklist, "Maybe later" leaves them in the app (the card on Home stays as a reminder).
 */
export function WelcomeProfileSheet() {
  const router = useRouter();
  const [user, setUser] = useState(authStore.user);
  const [open, setOpen] = useState(false);

  useEffect(() => authStore.subscribe(() => setUser(authStore.user)), []);

  const userId = user?.id;
  const incomplete = needsProfileWork(user?.profileCompletion);
  useEffect(() => {
    if (!userId || !incomplete) return;
    let cancelled = false;
    void hasSeenWelcome(userId).then((seen) => {
      if (cancelled || seen) return;
      setOpen(true);
      void markWelcomeSeen(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, incomplete]);

  const completion = user?.profileCompletion;
  if (!user || !completion) return null;
  const firstName = user.firstName || user.name?.split(' ')[0] || '';
  const hirer = user.role === 'hirer';

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setOpen(false)}>
        <Pressable style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 }} onPress={() => undefined}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }} className="font-sans">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8, lineHeight: 21 }} className="font-sans">
            {hirer
              ? 'Your account is ready. Add your company details and verify your company so candidates know who is hiring. It takes a few minutes and you can stop any time.'
              : 'Your account is ready. Tell us a little more about you and we will show opportunities that fit. It takes a few minutes and you can stop any time.'}
          </Text>
          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 12, color: '#8A8D9F', marginBottom: 6 }} className="font-sans">{`Your profile is ${completion.percent}% complete`}</Text>
            <CompletionBar percent={completion.percent} />
          </View>
          <TouchableOpacity
            testID="welcome-complete"
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              router.push('/profile/complete' as never);
            }}
            style={{ marginTop: 22, height: 52, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' }} className="font-sans">Complete my profile</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="welcome-later" accessibilityRole="button" onPress={() => setOpen(false)} style={{ marginTop: 10, height: 48, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B7280' }} className="font-sans">Maybe later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
