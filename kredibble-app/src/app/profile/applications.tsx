/**
 * Profile → Applications status (GOD-T91): every opportunity the person applied to in the app, newest first, with its real
 * location, type and stage. The list reloads each time the screen is shown, so an application just sent appears. Mapping and
 * wording live in lib/application-status.ts (tested in __tests__/application-status.test.ts).
 */
import React, { useCallback, useState } from 'react';
import { Colors } from '../../constants/design';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { getMyApplications } from '../../lib/api';
import {
  STAGE_FILTERS,
  appliedLabel,
  emptyMessage,
  filterByStage,
  toApplicationCards,
  type ApplicationCard,
  type ApplicationStage,
  type StageFilter,
} from '../../lib/application-status';

/** Badge colours per stage: amber waiting, purple moving, green good news, red no. */
const STAGE_STYLES: Record<ApplicationStage, { bg: string; text: string }> = {
  'In review': { bg: '#FEF3C7', text: '#B45309' },
  Shortlisted: { bg: '#EDE9FE', text: '#6D28D9' },
  Interview: { bg: '#E0F2FE', text: '#0369A1' },
  Offered: { bg: '#DCFCE7', text: '#15803D' },
  Rejected: { bg: '#FFEAEA', text: '#C53030' },
};

export default function ApplicationsStatusScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<StageFilter>('All');
  const [applications, setApplications] = useState<ApplicationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setError(null);
    getMyApplications()
      .then((response) => {
        if (!active) return;
        setApplications(toApplicationCards(response));
        setLoading(false);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message ? `Your applications could not be loaded: ${err.message}` : 'Your applications could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Reload whenever the screen is shown, so an application sent a moment ago is listed.
  useFocusEffect(load);

  const handleRetry = () => {
    setLoading(true);
    load();
  };

  const currentList = filterByStage(applications, activeFilter);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} className="font-sans">Applications status</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stage filters: every kind of opportunity is listed together (a fellowship is not a job). */}
      <View style={styles.subFiltersContainer}>
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersScroll}>
          {STAGE_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.subFilterPill, activeFilter === filter && styles.activeSubFilterPill]}
              onPress={() => setActiveFilter(filter)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: activeFilter === filter }}
            >
              <Text style={[styles.subFilterText, activeFilter === filter && styles.activeSubFilterText]} className="font-sans">
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable list */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[styles.emptyText, { marginTop: 12 }]} className="font-sans">Loading applications...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: '#ED4C5C', marginBottom: 12 }]} className="font-sans">{error}</Text>
            <TouchableOpacity onPress={handleRetry} style={[styles.subFilterPill, styles.activeSubFilterPill]}>
              <Text style={styles.activeSubFilterText} className="font-sans">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : currentList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, styles.emptyTextCentered]} className="font-sans">
              {emptyMessage(applications.length, activeFilter)}
            </Text>
            {applications.length === 0 && (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/opportunities')}
                style={[styles.subFilterPill, styles.activeSubFilterPill, { marginTop: 16 }]}
                accessibilityRole="button"
              >
                <Text style={styles.activeSubFilterText} className="font-sans">Browse opportunities</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          currentList.map((app) => {
            const stageStyle = STAGE_STYLES[app.stage];
            const details = [app.typeLabel, app.location].filter(Boolean).join(' · ');
            const applied = appliedLabel(app.appliedAt);
            const open = app.opportunityId ? () => router.push(`/opportunities/listing/${app.opportunityId}`) : undefined;
            return (
              <TouchableOpacity
                key={app.id}
                style={styles.appCard}
                onPress={open}
                disabled={!open}
                activeOpacity={0.8}
                accessibilityRole={open ? 'button' : undefined}
                accessibilityLabel={`${app.title}${app.company ? `, ${app.company}` : ''}. ${app.stage}.`}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.logoCircle, { backgroundColor: Colors.primary }]}>
                    <Text style={styles.logoText} className="font-sans">{(app.company || app.title).charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={styles.cardTitle} className="font-sans" numberOfLines={2}>{app.title}</Text>
                    {app.company ? <Text style={styles.companyText} className="font-sans">{app.company}</Text> : null}
                  </View>
                </View>

                {details ? (
                  <Text style={styles.descriptionText} className="font-sans" numberOfLines={2}>{details}</Text>
                ) : null}

                <View style={styles.cardDivider} />

                <View style={styles.cardFooter}>
                  <Text style={styles.appliedCountText} className="font-sans">{applied}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: stageStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: stageStyle.text }]} className="font-sans">
                      {app.stage}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E6F2',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  subFiltersContainer: {
    paddingVertical: 14,
  },
  subFiltersScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  subFilterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E6F2',
  },
  activeSubFilterPill: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  subFilterText: {
    fontSize: 12,
    color: '#8A8D9F',
    fontWeight: '500',
  },
  activeSubFilterText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 18,
  },
  companyText: {
    fontSize: 12,
    color: '#8A8D9F',
    marginTop: 2,
  },
  descriptionText: {
    fontSize: 12,
    color: '#8A8D9F',
    lineHeight: 18,
    marginTop: 12,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F7F7F9',
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appliedCountText: {
    fontSize: 11,
    color: '#8A8D9F',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 13,
    color: '#8A8D9F',
  },
  emptyTextCentered: {
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
});
