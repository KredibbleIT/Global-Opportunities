import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { isCardSnoozed, nextStep, needsProfileWork, snoozeCard, stepRoute } from '../../lib/profile-prompts';

/** The completion shown as a bar. It never starts empty: the name and date of birth given at sign-up already count. */
export function CompletionBar({ percent }: { percent: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 8, borderRadius: 4, backgroundColor: Colors.primary10, overflow: 'hidden' }}
    >
      <View style={{ height: 8, width: `${Math.max(percent, 4)}%`, borderRadius: 4, backgroundColor: Colors.primary }} />
    </View>
  );
}

/**
 * "Complete your profile": how far along the person is, the next thing to do, and a way in. Shows nothing once the profile is complete.
 * On Home it can be put away for a few days (`dismissible`); on the Profile tab it stays.
 */
export function ProfileCompletionCard({ dismissible = false }: { dismissible?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState(authStore.user);
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => authStore.subscribe(() => setUser(authStore.user)), []);

  const userId = user?.id;
  useEffect(() => {
    if (!dismissible || !userId) return;
    let cancelled = false;
    void isCardSnoozed(userId).then((value) => {
      if (!cancelled) setSnoozed(value);
    });
    return () => {
      cancelled = true;
    };
  }, [dismissible, userId]);

  const completion = user?.profileCompletion;
  if (!user || !needsProfileWork(completion) || snoozed) return null;

  const step = nextStep(completion);

  return (
    <View
      testID="profile-completion-card"
      style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#EDE7F3' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }} className="font-sans">Complete your profile</Text>
        {dismissible ? (
          <TouchableOpacity
            testID="profile-card-dismiss"
            accessibilityLabel="Hide for now"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
              setSnoozed(true);
              void snoozeCard(user.id);
            }}
          >
            <X size={16} color="#A1A1AA" />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 12 }} className="font-sans">
        {`${completion.percent}% done${step ? `. Next: ${step.label.charAt(0).toLowerCase()}${step.label.slice(1)}` : ''}`}
      </Text>
      <CompletionBar percent={completion.percent} />
      <TouchableOpacity
        testID="profile-card-continue"
        onPress={() => router.push(step ? (stepRoute(step.id) as never) : ('/profile/complete' as never))}
        accessibilityRole="button"
        style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }} className="font-sans">Continue</Text>
        <ChevronRight size={18} color={Colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/profile/complete' as never)} accessibilityRole="button" style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 12, color: '#8A8D9F' }} className="font-sans">See all steps</Text>
      </TouchableOpacity>
    </View>
  );
}
