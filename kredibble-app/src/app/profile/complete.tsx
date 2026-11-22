import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { getMe } from '../../lib/api';
import { STEP_HELP, stepRoute } from '../../lib/profile-prompts';
import { CompletionBar } from '../../components/profile/ProfileCompletionCard';

/** "Complete your profile": every step, which are done, and a way into each one. */
export default function CompleteProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState(authStore.user);

  useEffect(() => authStore.subscribe(() => setUser(authStore.user)), []);

  // Pick up changes made elsewhere (for example documents uploaded on another phone).
  useEffect(() => {
    if (!authStore.token) return;
    getMe()
      .then((fresh) => authStore.setSession(authStore.token!, fresh))
      .catch(() => undefined);
  }, []);

  const completion = user?.profileCompletion;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back" activeOpacity={0.7}>
          <ChevronLeft size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} className="font-sans">Complete your profile</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        {!completion ? (
          <Text style={styles.muted} className="font-sans">There is nothing to complete for this account.</Text>
        ) : (
          <>
            <View style={styles.summary}>
              {completion.complete ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <PartyPopper size={22} color={Colors.primary} />
                  <Text style={styles.summaryTitle} className="font-sans">Your profile is complete</Text>
                </View>
              ) : (
                <Text style={styles.summaryTitle} className="font-sans">{`${completion.percent}% complete`}</Text>
              )}
              <Text style={styles.muted} className="font-sans">
                {completion.complete ? 'Nice work. You can change any of this at any time.' : 'Do the steps in any order. Each one is saved on its own, so you can stop whenever you like.'}
              </Text>
              <View style={{ marginTop: 14 }}>
                <CompletionBar percent={completion.percent} />
              </View>
            </View>

            {completion.steps.map((step) => (
              <TouchableOpacity
                key={step.id}
                testID={`step-${step.id}`}
                onPress={() => router.push(stepRoute(step.id) as never)}
                accessibilityRole="button"
                accessibilityLabel={`${step.label}${step.done ? ', done' : ''}`}
                style={styles.row}
                activeOpacity={0.8}
              >
                <View style={[styles.tick, step.done && styles.tickDone]}>{step.done ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} className="font-sans">{step.label}</Text>
                  {!step.done && STEP_HELP[step.id] ? <Text style={styles.rowHelp} className="font-sans">{STEP_HELP[step.id]}</Text> : null}
                </View>
                <ChevronRight size={18} color="#A1A1AA" />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F9' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#E5E6F2', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A1A' },
  summary: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 16 },
  summaryTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 6 },
  muted: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  tickDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowHelp: { fontSize: 12, color: '#8A8D9F', marginTop: 2 },
});
