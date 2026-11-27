import { useEffect, useState } from 'react';
import { hasRichMarks } from '../../../lib/rich-text';
import { RichText } from '../../../components/ui/RichText';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CalendarClock, MapPin, Wallet, Timer, Laptop, Layers, Tag, BadgeCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Radius } from '../../../constants/design';
import { getOpportunityCategory } from '../../../constants/opportunityCategories';
import { applyForOpportunity, getOpportunityById } from '../../../lib/api';
import { applicationBody, asksForReferralCode } from '../../../lib/referral';
import { askForCv, lacksCv } from '../../../lib/apply-prompt';
import { stepRoute } from '../../../lib/profile-prompts';
import { useToast } from '../../../components/ui/ToastProvider';
import { applyUrlOf, deadlineBadge, formatDeadline, formatLabel, fundingOf, isClosed, orgOf, placeOf, toLines, type Listing } from '../../../lib/opportunityListing';

// One listing of a category without a screen of its own (volunteering, scholarships, fellowships, training, mentorship): the organisation, the key
// facts, the description, who can apply and what it offers, and Apply. Apply opens the listing's own application link when it has one; otherwise
// the application is sent through the app. When the listing asks for an ambassador's referral code (GOD-T105), an optional field
// above Apply takes it and it goes with the application, so the ambassador who sent the person is credited.

function Fact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary10, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: Colors.textMuted }} className="font-sans">{label}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.textBody, marginTop: 1 }} className="font-sans">{value}</Text>
      </View>
    </View>
  );
}

function Section({ title, lines, text }: { title: string; lines: string[]; text?: unknown }) {
  if (lines.length === 0) return null;
  // Text that uses formatting (a heading, a list, bold, a link) is shown formatted; plain text keeps its lines as bullets, as it always did.
  if (typeof text === 'string' && hasRichMarks(text)) {
    return (
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 16, color: Colors.textBody, marginBottom: 8 }} className="font-heading font-bold">{title}</Text>
        <RichText text={text} textStyle={{ fontSize: 14, lineHeight: 22, color: Colors.textMuted }} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ fontSize: 16, color: Colors.textBody, marginBottom: 8 }} className="font-heading font-bold">{title}</Text>
      {lines.length === 1 ? (
        <Text style={{ fontSize: 14, lineHeight: 22, color: Colors.textMuted }} className="font-sans">{lines[0]}</Text>
      ) : (
        lines.map((line, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 14, lineHeight: 22, color: Colors.primary }}>•</Text>
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: Colors.textMuted }} className="font-sans">{line}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export default function OpportunityListingScreen() {
  const router = useRouter();
  const { id, key } = useLocalSearchParams<{ id: string; key?: string }>();
  const category = getOpportunityCategory(key);
  const { showToast } = useToast();
  const [item, setItem] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    if (!id) return;
    let active = true;
    getOpportunityById(String(id))
      .then((data) => { if (active) setItem(data as Listing); })
      .catch((err) => { if (active) setError(err?.message || 'Could not load this listing'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/opportunities' as any));

  const apply = async () => {
    if (!item || applying || applied) return;
    const url = applyUrlOf(item);
    if (url) {
      Linking.openURL(url).catch(() => showToast('Could not open the application link.'));
      return;
    }
        if (lacksCv()) {
      const choice = await askForCv();
      if (choice === 'cancel') return;
      if (choice === 'add') {
        router.push(stepRoute('cv') as never);
        return;
      }
    }
    setApplying(true);
    try {
      await applyForOpportunity(String(id), applicationBody('Applied via the Global Opportunity Desk app', asksForReferralCode(item) ? referralCode : ''));
      setApplied(true);
      showToast(`Your application to ${item.title} was sent.`);
    } catch (err: any) {
      if (err?.status === 409 || err?.message?.includes('already applied')) {
        setApplied(true);
        showToast('You have already applied for this opportunity.');
      } else if (err?.message?.includes('Invalid referral code')) {
        showToast('That referral code was not found. Check it with the ambassador, or clear it to apply without one.');
      } else {
        showToast(err?.message || 'Application failed. Please try again.');
      }
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (error || !item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: Colors.textHeading, fontSize: 16, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }} className="font-sans">
          {error || 'Listing not found'}
        </Text>
        <TouchableOpacity onPress={goBack} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 8, marginTop: 12 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }} className="font-sans">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const org = orgOf(item);
  const badge = deadlineBadge(item);
  const closed = isClosed(item);
  const deadline = formatDeadline(item);
  const place = placeOf(item);
  const format = formatLabel(item);
  const logo = item.organizationLogo || item.logoUrl;
  const external = !!applyUrlOf(item);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <TouchableOpacity
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#E5E6F2', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}
        >
          <ChevronLeft size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#1A1A1A', paddingHorizontal: 8 }} className="font-sans">
          {category?.title ?? 'Opportunity'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Organisation and title */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          {logo ? (
            <Image source={{ uri: String(logo) }} style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: '#FFFFFF' }} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 'bold' }}>{(org || item.title || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {!!org && <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 12 }} className="font-sans">{org}</Text>}
          <Text style={{ fontSize: 22, lineHeight: 29, color: Colors.textBody, textAlign: 'center', marginTop: 4 }} className="font-heading font-bold">{item.title}</Text>
          <View style={{ marginTop: 12, backgroundColor: closed ? '#FEE2E2' : badge.tone === 'soon' ? '#FEF3C7' : badge.tone === 'open' ? '#DCFCE7' : '#EEF0F6', borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: closed ? '#DC2626' : badge.tone === 'soon' ? '#B45309' : badge.tone === 'open' ? '#15803D' : '#6B7280' }} className="font-sans">
              {badge.text}
            </Text>
          </View>
        </View>

        {/* Key facts */}
        <View style={{ backgroundColor: Colors.bgCard, borderRadius: Radius.card, paddingHorizontal: 16, paddingVertical: 6, marginTop: 22 }}>
          {!!deadline && <Fact icon={CalendarClock} label="Deadline" value={deadline} />}
          {!!place && <Fact icon={MapPin} label="Location" value={place} />}
          {!!format && <Fact icon={Laptop} label="Format" value={format} />}
          {!!fundingOf(item) && <Fact icon={Wallet} label="Cost or funding" value={String(fundingOf(item))} />}
          {!!item.costLabel && !!item.fundingType && <Fact icon={Wallet} label="Cost details" value={String(item.costLabel)} />}
          {!!item.durationLabel && <Fact icon={Timer} label="Duration" value={String(item.durationLabel)} />}
          {!!item.level && <Fact icon={Layers} label="Level" value={String(item.level)} />}
          {!!item.focusArea && <Fact icon={Tag} label="Focus" value={String(item.focusArea)} />}
          {!!item.certificateOffered && <Fact icon={BadgeCheck} label="Certificate" value="Offered" />}
        </View>

        <Section title="About" lines={toLines(item.description)} text={item.description} />
        <Section title="Who can apply" lines={toLines(item.eligibility)} text={item.eligibility} />
        <Section title="What it offers" lines={toLines(item.benefits)} text={item.benefits} />
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        {asksForReferralCode(item) && !external && !closed && !applied && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textBody, marginBottom: 6 }} className="font-sans" nativeID="referral-label">
              Ambassador referral code (optional)
            </Text>
            <TextInput
              value={referralCode}
              onChangeText={setReferralCode}
              placeholder="e.g. GOD-AB12CD"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabelledBy="referral-label"
              accessibilityHint="The code of the ambassador who told you about this opportunity"
              testID="referral-code-input"
              style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderDefault, backgroundColor: Colors.bgCard, paddingHorizontal: 14, fontSize: 15, color: Colors.textDefault }}
            />
          </View>
        )}
        <TouchableOpacity
          onPress={apply}
          disabled={closed || applying || applied}
          accessibilityRole="button"
          style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: closed || applied ? '#C9CAD6' : Colors.primary }}
        >
          {applying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }} className="font-sans">
              {closed ? 'Applications closed' : applied ? 'Applied' : external ? 'Apply on the website' : 'Apply now'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
