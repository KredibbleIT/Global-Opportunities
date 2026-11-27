import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, Trophy } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { countLabel, getAmbassadorLeaderboard, monthLabel, placeLabel, type Leaderboard, type LeaderboardRow } from '../../lib/ambassador-results';

/**
 * Ambassador leaderboard (GOD-T106), opened from the ambassador card on the Profile tab. This month's ambassadors in order:
 * verified sign-ups first, then referred clicks, then shares, the same ranking as the admin's Leaderboard page. The person's own
 * row is highlighted, and shown below the list when they are outside the top 50. Only current ambassadors can open it.
 */
function Row({ row }: { row: LeaderboardRow }) {
  const place = placeLabel(row);
  return (
    <View
      style={[styles.row, row.isYou && styles.rowYou]}
      accessible
      accessibilityLabel={`Rank ${row.rank}. ${row.name}${row.isYou ? ' (you)' : ''}. ${countLabel(row.signups, 'verified sign-up')}, ${countLabel(row.clicks, 'click')}, ${countLabel(row.shares, 'share')}.`}
      testID={row.isYou ? 'leaderboard-row-you' : 'leaderboard-row'}
    >
      <Text style={[styles.rank, row.rank <= 3 && styles.rankTop]} className="font-sans">{row.rank}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.name} className="font-sans" numberOfLines={1}>{row.name}{row.isYou ? ' (you)' : ''}</Text>
        {place !== '' && <Text style={styles.meta} className="font-sans" numberOfLines={1}>{place}</Text>}
        <Text style={styles.counts} className="font-sans">
          {countLabel(row.signups, 'sign-up')} · {countLabel(row.clicks, 'click')} · {countLabel(row.shares, 'share')}
        </Text>
      </View>
    </View>
  );
}

export default function AmbassadorLeaderboardScreen() {
  const router = useRouter();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let active = true;
    setError(null);
    getAmbassadorLeaderboard()
      .then((result) => {
        if (!active) return;
        setBoard(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'The leaderboard could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={20} color={Colors.textDefault} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} className="font-sans" accessibilityRole="header">Leaderboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.stateTitle} className="font-sans">We could not load the leaderboard</Text>
          <Text style={styles.stateText} className="font-sans">{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }} accessibilityRole="button">
            <Text style={styles.retryText} className="font-sans">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !board || board.rows.length === 0 ? (
        <View style={styles.centered}>
          <Trophy size={32} color={Colors.textMuted} />
          <Text style={styles.stateTitle} className="font-sans">No results yet this month</Text>
          <Text style={styles.stateText} className="font-sans">Share opportunities with your referral code to appear here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle} className="font-sans">
            {monthLabel(board.month)} · ranked by verified sign-ups, then clicks, then shares
          </Text>
          {board.rows.map((row) => <Row key={`${row.rank}-${row.name}`} row={row} />)}
          {board.you && (
            <>
              <Text style={styles.gap} className="font-sans">Your place</Text>
              <Row row={board.you} />
            </>
          )}
        </ScrollView>
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
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: 14, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderDefault },
  rowYou: { borderColor: Colors.primary, borderWidth: 2 },
  rank: { width: 32, fontSize: 16, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  rankTop: { color: Colors.primary },
  rowBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.textDefault },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  counts: { fontSize: 13, color: Colors.textBody, marginTop: 4 },
  gap: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginTop: 8, marginBottom: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  stateTitle: { fontSize: 16, fontWeight: '600', color: Colors.textHeading, textAlign: 'center' },
  stateText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  retry: { marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', backgroundColor: Colors.primary },
  retryText: { fontSize: 14, fontWeight: '600', color: Colors.textOnPrimary },
});
