import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Users } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { initialsOf, showcaseView, type ShowcaseData, type ShowcaseEntry, type ShowcaseKind } from '../../constants/mockShowcase';
import { getShowcase } from '../../lib/showcase';

/**
 * Meet our people (Profile > "Meet our people"): the ambassadors, team, partners and stakeholders the desk features.
 * Read only. The admin dashboard's Showcase page decides who appears (visible entries only, in the admin's order).
 *
 * - Chips filter by category ("All" shows every category with its heading).
 * - A card shows a photo (initials when there is none; round for people, square for organisations), name, role and country, and the
 *   first lines of the bio. Tap a card to read the whole bio.
 * - States: loading, error with "Try again", and empty ("Nobody to show yet"). Without a backend list the empty state shows in release builds.
 */
const ALL = 'all';

function Avatar({ entry, kind }: { entry: ShowcaseEntry; kind: ShowcaseKind }) {
  const shape = kind === 'person' ? styles.avatarRound : styles.avatarSquare;
  if (entry.photoUrl) {
    return <Image source={{ uri: entry.photoUrl }} style={[styles.avatar, shape]} accessibilityIgnoresInvertColors accessible={false} />;
  }
  return (
    <View style={[styles.avatar, shape, styles.avatarInitials]} accessible={false}>
      <Text style={styles.avatarText} className="font-sans">{initialsOf(entry.name)}</Text>
    </View>
  );
}

function PersonCard({ entry, kind }: { entry: ShowcaseEntry; kind: ShowcaseKind }) {
  const [open, setOpen] = useState(false);
  const meta = [entry.title, entry.country].filter(Boolean).join(' · ');
  const hasBio = entry.bio.trim().length > 0;
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => hasBio && setOpen((value) => !value)}
      accessibilityRole={hasBio ? 'button' : 'text'}
      accessibilityLabel={`${entry.name}. ${meta}.`}
      accessibilityHint={hasBio ? (open ? 'Shows less of the bio' : 'Shows the whole bio') : undefined}
      accessibilityState={hasBio ? { expanded: open } : undefined}
      testID="showcase-card"
    >
      <Avatar entry={entry} kind={kind} />
      <View style={styles.cardBody}>
        <Text style={styles.name} className="font-sans">{entry.name}</Text>
        {meta !== '' && <Text style={styles.meta} className="font-sans">{meta}</Text>}
        {hasBio && (
          <Text style={styles.bio} className="font-sans" numberOfLines={open ? undefined : 3}>
            {entry.bio}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function MeetOurPeopleScreen() {
  const router = useRouter();
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string>(ALL);

  // `attempt` changes when "Try again" is pressed, which runs the load again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getShowcase()
      .then((result) => {
        if (!alive) return;
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setAttempt((count) => count + 1);
  };

  const groups = useMemo(() => (data ? showcaseView(data) : []), [data]);
  const shown = selected === ALL ? groups : groups.filter((group) => group.category.id === selected);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={20} color={Colors.textDefault} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} className="font-sans" accessibilityRole="header">Meet our people</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered} testID="showcase-loading">
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.stateText} className="font-sans">Loading…</Text>
        </View>
      ) : failed ? (
        <View style={styles.centered} testID="showcase-error">
          <Text style={styles.stateTitle} className="font-sans">We could not load this page</Text>
          <Text style={styles.stateText} className="font-sans">Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retry} onPress={retry} accessibilityRole="button">
            <Text style={styles.retryText} className="font-sans">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered} testID="showcase-empty">
          <Users size={32} color={Colors.textMuted} />
          <Text style={styles.stateTitle} className="font-sans">Nobody to show yet</Text>
          <Text style={styles.stateText} className="font-sans">The ambassadors, team and partners we feature will appear here.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
            {[{ id: ALL, name: 'All' }, ...groups.map((group) => ({ id: group.category.id, name: group.category.name }))].map((chip) => {
              const active = chip.id === selected;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelected(chip.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`showcase-chip-${chip.id}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} className="font-sans">{chip.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.content}>
            {shown.map((group) => (
              <View key={group.category.id} style={styles.section} testID="showcase-group">
                {selected === ALL && (
                  <Text style={styles.sectionTitle} className="font-sans" accessibilityRole="header">{group.category.name}</Text>
                )}
                {group.entries.map((entry) => (
                  <PersonCard key={entry.id} entry={entry} kind={group.category.kind} />
                ))}
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgScreen },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.borderDefault, backgroundColor: Colors.bgCard, justifyContent: 'center', alignItems: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.textHeading },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderDefault },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: Colors.textMuted },
  chipTextActive: { color: Colors.textOnPrimary, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textHeading, marginBottom: 8 },
  card: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10, borderRadius: 14, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderDefault, minHeight: 44 },
  avatar: { width: 56, height: 56 },
  avatarRound: { borderRadius: 28 },
  avatarSquare: { borderRadius: 12 },
  avatarInitials: { backgroundColor: Colors.primaryTransparent, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.primaryDark },
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textDefault },
  meta: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  bio: { fontSize: 13, lineHeight: 19, color: Colors.textBody, marginTop: 6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  stateTitle: { fontSize: 16, fontWeight: '600', color: Colors.textHeading, textAlign: 'center' },
  stateText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  retry: { marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', backgroundColor: Colors.primary },
  retryText: { fontSize: 14, fontWeight: '600', color: Colors.textOnPrimary },
});
