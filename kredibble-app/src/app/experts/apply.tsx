import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle2, Circle, Clock, EyeOff, XCircle } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { Header } from '../../components/ui/Header';
import { useToast } from '../../components/ui/ToastProvider';
import { applyAsExpert, getMyExpertState, MyExpertState, updateExpertContactChoices, withdrawAsExpert } from '../../lib/api';

const REQUIREMENTS: { key: string; label: string }[] = [
  { key: 'profession', label: 'Your profession' },
  { key: 'summary', label: 'A short summary about you' },
  { key: 'skills', label: 'At least one skill' },
];

/**
 * A seeker applies to be shown on the Expert listing. A team member reviews each application; only approved experts appear. The seeker chooses
 * which contact details people can see (all off to begin with) and can change that, or leave the listing, at any time.
 */
export default function BecomeExpertScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, setState] = useState<MyExpertState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // What the person has switched on but not saved yet.
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [showWebsite, setShowWebsite] = useState(false);
  const [website, setWebsite] = useState('');

  const adopt = useCallback((next: MyExpertState) => {
    setState(next);
    setShowEmail(next.showEmail);
    setShowPhone(next.showPhone);
    setShowWebsite(next.showWebsite);
    setWebsite(next.website ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyExpertState()
        .then((next) => { if (active) { adopt(next); setFailed(false); } })
        .catch(() => { if (active) setFailed(true); });
      return () => { active = false; };
    }, [adopt]),
  );

  const choices = () => ({ showEmail, showPhone, showWebsite: showWebsite && website.trim().length > 0, website: website.trim() });

  const run = async (task: () => Promise<MyExpertState>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      adopt(await task());
      showToast(done, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, hint: string, value: boolean, onChange: (next: boolean) => void, testID: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textHeading }} className="font-sans">{label}</Text>
        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }} className="font-sans">{hint}</Text>
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} />
    </View>
  );

  const card = { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16 } as const;
  const primaryButton = (label: string, onPress: () => void, testID: string, disabled = false) => (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      style={{ backgroundColor: Colors.primary, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled || busy ? 0.5 : 1 }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }} className="font-sans">{busy ? 'Please wait…' : label}</Text>
    </TouchableOpacity>
  );

  const status = state?.status ?? 'none';
  const canApply = status === 'none' || status === 'rejected';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      <Header title="Expert listing" showBack />
      {!state ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          {failed ? (
            <Text style={{ fontSize: 14, color: Colors.textMuted, textAlign: 'center' }} className="font-sans">We could not load this. Check your connection and try again.</Text>
          ) : (
            <ActivityIndicator size="small" color={Colors.primary} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Where things stand */}
          {status === 'pending' && (
            <View style={[card, { flexDirection: 'row', gap: 12 }]} testID="expert-status-pending">
              <Clock size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textHeading }} className="font-sans">Your application is being reviewed</Text>
                <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 19 }} className="font-sans">We will notify you as soon as a team member has decided. You do not appear on the listing until then.</Text>
              </View>
            </View>
          )}
          {status === 'approved' && (
            <View style={[card, { flexDirection: 'row', gap: 12 }]} testID="expert-status-approved">
              <CheckCircle2 size={22} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textHeading }} className="font-sans">You are on the Expert listing</Text>
                <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 19 }} className="font-sans">
                  {state.ratingCount > 0 ? `Rated ${state.rating.toFixed(1)} by ${state.ratingCount} ${state.ratingCount === 1 ? 'person' : 'people'}. ` : 'No ratings yet. '}
                  Your profile details come from your profile, so keep it up to date.
                </Text>
                {!!state.profileId && (
                  <TouchableOpacity onPress={() => router.push(`/experts/${state.profileId}` as never)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primary }} className="font-sans">See how your profile looks</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          {status === 'rejected' && (
            <View style={[card, { flexDirection: 'row', gap: 12 }]} testID="expert-status-rejected">
              <XCircle size={22} color={Colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textHeading }} className="font-sans">Not approved yet</Text>
                {!!state.reviewNote && <Text style={{ fontSize: 13, color: Colors.textBody, marginTop: 4, lineHeight: 19 }} className="font-sans">{state.reviewNote}</Text>}
                <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 19 }} className="font-sans">Update your profile, then apply again.</Text>
              </View>
            </View>
          )}
          {status === 'hidden' && (
            <View style={[card, { flexDirection: 'row', gap: 12 }]} testID="expert-status-hidden">
              <EyeOff size={22} color={Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textHeading }} className="font-sans">Your listing is hidden</Text>
                {!!state.reviewNote && <Text style={{ fontSize: 13, color: Colors.textBody, marginTop: 4, lineHeight: 19 }} className="font-sans">{state.reviewNote}</Text>}
                <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 19 }} className="font-sans">The team took your profile off the listing. Please contact support if you think this is a mistake.</Text>
              </View>
            </View>
          )}

          {status === 'none' && (
            <Text style={{ fontSize: 14, color: Colors.textMuted, lineHeight: 21, marginBottom: 16 }} className="font-sans">
              Be listed on the Expert listing so other people, including hirers, can find you and read your profile. A team member checks every application first.
            </Text>
          )}

          {/* What the profile needs */}
          {status !== 'hidden' && status !== 'approved' && (
            <View style={card}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textHeading, marginBottom: 8 }} className="font-sans">What your profile needs</Text>
              {REQUIREMENTS.map((item) => {
                const missing = state.missing.includes(item.key);
                return (
                  <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 }}>
                    {missing ? <Circle size={18} color={Colors.textPlaceholder} /> : <CheckCircle2 size={18} color="#16A34A" />}
                    <Text style={{ fontSize: 14, color: missing ? Colors.textBody : Colors.textMuted }} className="font-sans">{item.label}</Text>
                  </View>
                );
              })}
              {!state.eligible && (
                <TouchableOpacity testID="complete-profile" onPress={() => router.push('/profile/manage' as never)} style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primary }} className="font-sans">Complete your profile</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* What people can see */}
          {status !== 'hidden' && (
            <View style={card}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textHeading }} className="font-sans">What people can see</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2, marginBottom: 4, lineHeight: 18 }} className="font-sans">
                Your name, photo, profession, location and the profile details are always shown. Contact details stay private unless you switch them on.
              </Text>
              {row('Show my email', 'People can copy your email address.', showEmail, setShowEmail, 'expert-show-email')}
              {row('Show my phone number', 'People can copy the number on your profile.', showPhone, setShowPhone, 'expert-show-phone')}
              {row('Show my website', 'A link on your profile.', showWebsite, setShowWebsite, 'expert-show-website')}
              {showWebsite && (
                <TextInput
                  testID="expert-website"
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="yourname.com"
                  placeholderTextColor={Colors.textPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{ height: 46, borderWidth: 1, borderColor: Colors.borderDefault, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: Colors.textHeading, marginTop: 4 }}
                  className="font-sans"
                />
              )}
            </View>
          )}

          {canApply && primaryButton(status === 'rejected' ? 'Apply again' : 'Submit for review', () => run(() => applyAsExpert(choices()), 'Your application was sent for review.'), 'expert-apply', !state.eligible)}
          {(status === 'pending' || status === 'approved') && primaryButton('Save changes', () => run(() => updateExpertContactChoices(choices()), 'Saved.'), 'expert-save')}
          {(status === 'pending' || status === 'approved') && (
            <TouchableOpacity testID="expert-withdraw" onPress={() => run(withdrawAsExpert, status === 'approved' ? 'You left the Expert listing.' : 'Your application was withdrawn.')} disabled={busy} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.error }} className="font-sans">{status === 'approved' ? 'Leave the Expert listing' : 'Withdraw my application'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
