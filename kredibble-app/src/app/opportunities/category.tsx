import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Radius } from '../../constants/design';
import { getOpportunityCategory } from '../../constants/opportunityCategories';
import { getOpportunitiesOfTypes } from '../../lib/api';
import { categoryFilterCount, categoryFilters, EMPTY_CATEGORY_FILTERS, type CategoryFilterState } from '../../lib/categoryFilterStore';
import {
  cardChips, daysLeft, deadlineBadge, facetValues, isClosed, isClosingSoon, matchesFacets, orgOf, placeOf,
  type DeadlineTone, type Listing,
} from '../../lib/opportunityListing';

// One opportunity category that has no screen of its own (volunteering, scholarships, fellowships, training, mentorship). It follows the Jobs and
// Grants screens: a header, a search bar, quick filters, then white cards (organisation tile, title, short facts and a "Closes in N days" badge).
// Each card opens the listing screen. Events, grants and jobs & internships keep their own screens.

type QuickFilter = 'all' | 'soon' | 'online' | 'in-person' | 'hybrid';
const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'soon', label: 'Closing soon' },
  { value: 'online', label: 'Online' },
  { value: 'in-person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
];

const BADGE: Record<DeadlineTone, { bg: string; fg: string }> = {
  soon: { bg: '#FEF3C7', fg: '#B45309' },
  open: { bg: '#DCFCE7', fg: '#15803D' },
  closed: { bg: '#FEE2E2', fg: '#DC2626' },
  none: { bg: '#EEF0F6', fg: '#6B7280' },
};

/** Open listings first, the soonest deadline first; ones without a deadline next; closed ones last. */
const byDeadline = (a: Listing, b: Listing): number => {
  const rank = (item: Listing) => (isClosed(item) ? 2 : daysLeft(item) === null ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0);
};

const matchesFilter = (item: Listing, filter: QuickFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'soon') return isClosingSoon(item);
  return item.format === filter;
};

const matchesQuery = (item: Listing, query: string): boolean => {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [item.title, orgOf(item), item.description, item.location, item.country].some((value) => String(value ?? '').toLowerCase().includes(term));
};

function ListingCard({ item, chips, onPress }: { item: Listing; chips: string[]; onPress: () => void }) {
  const badge = deadlineBadge(item);
  const colors = BADGE[badge.tone];
  const org = orgOf(item);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      style={{ backgroundColor: Colors.bgCard, borderRadius: Radius.card, padding: 16, marginBottom: 12, opacity: badge.tone === 'closed' ? 0.7 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>{(org || item.title || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, color: Colors.textBody }} className="font-heading font-semibold">
            {item.title}
          </Text>
          {!!org && (
            <Text numberOfLines={1} style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }} className="font-sans">
              {org}
            </Text>
          )}
        </View>
      </View>

      {!!item.description && (
        <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 19, color: Colors.textMuted, marginTop: 12 }} className="font-sans">
          {item.description}
        </Text>
      )}

      {chips.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {chips.map((chip) => (
            <View key={chip} style={{ backgroundColor: Colors.primary10, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text numberOfLines={1} style={{ fontSize: 11, color: Colors.primary, fontWeight: '600' }} className="font-sans">{chip}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <View style={{ backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: 11, color: colors.fg, fontWeight: '600' }} className="font-sans">{badge.text}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function OpportunityCategoryScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const category = getOpportunityCategory(key);
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('all');
  // The filters chosen on the filter page (kept in categoryFilterStore); read again each time this screen comes into view.
  const [filters, setFilters] = useState<CategoryFilterState>(EMPTY_CATEGORY_FILTERS);
  useFocusEffect(
    useCallback(() => {
      setFilters(categoryFilters.get(String(key)));
    }, [key]),
  );

  useEffect(() => {
    if (!category) return;
    let active = true;
    getOpportunitiesOfTypes(category.apiTypes)
      .then((data) => { if (active) { setItems(data); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, attempt]);

  const location = filters.location.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items
        .filter((item) => matchesFilter(item, filter) && matchesQuery(item, query) && matchesFacets(item, filters.selection, filters.certificateOnly))
        .filter((item) => !location || (placeOf(item) ?? '').toLowerCase().includes(location))
        .sort(byDeadline),
    [items, filter, query, filters, location],
  );
  const activeFilters = categoryFilterCount(filters);
  const resetFilters = () => {
    categoryFilters.reset(String(key));
    setFilters(EMPTY_CATEGORY_FILTERS);
  };
  // The filter page offers the values this category's listings really have.
  const openFilters = () => {
    const options: Record<string, string[]> = {};
    for (const field of category?.list.facets ?? []) options[field] = facetValues(items, field);
    categoryFilters.setOptions(String(key), options);
    router.push({ pathname: '/opportunities/filter', params: { key } } as any);
  };
  const hasFilterPage = !!category;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/opportunities' as any));
  const noun = category?.list.noun ?? 'listing';
  const narrowed = filter !== 'all' || query.trim() !== '' || activeFilters > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#E5E6F2', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}
        >
          <ChevronLeft size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <Text numberOfLines={2} style={{ flex: 1, textAlign: 'center', fontSize: 16, lineHeight: 21, fontWeight: '600', color: '#1A1A1A', paddingHorizontal: 8 }} className="font-sans">
          {category?.title ?? 'Opportunities'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, paddingHorizontal: 16, height: 50, marginBottom: 14 }}>
          <Search size={18} color="#A1A1AA" style={{ marginRight: 10 }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={category?.list.placeholder ?? 'Search'}
            placeholderTextColor="#A1A1AA"
            style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
            className="font-sans"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} style={{ marginRight: 14 }}>
              <X size={16} color="#A1A1AA" />
            </TouchableOpacity>
          )}
          {hasFilterPage && (
            <TouchableOpacity onPress={openFilters} accessibilityRole="button" accessibilityLabel="Filters" hitSlop={10}>
              <View>
                <SlidersHorizontal size={18} color={Colors.primary} />
                {activeFilters > 0 && (
                  <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: Colors.primary, borderRadius: 9999, width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF', fontSize: 8, fontWeight: 'bold' }}>{activeFilters}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
          {QUICK_FILTERS.map((entry) => {
            const active = filter === entry.value;
            return (
              <TouchableOpacity
                key={entry.value}
                onPress={() => setFilter(entry.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center',
                  backgroundColor: active ? Colors.primary : Colors.bgCard,
                  borderWidth: 1, borderColor: active ? Colors.primary : Colors.borderDefault,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFFFFF' : Colors.textMuted }} className="font-sans">{entry.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading && <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />}

        {!loading && failed && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: Colors.textMuted, marginBottom: 12 }} className="font-sans">Could not load these listings.</Text>
            <TouchableOpacity onPress={() => { setLoading(true); setAttempt((n) => n + 1); }} accessibilityRole="button">
              <Text style={{ color: Colors.primary, fontWeight: '600' }} className="font-sans">Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !failed && items.length === 0 && (
          <Text style={{ textAlign: 'center', color: Colors.textMuted, paddingVertical: 40 }} className="font-sans">
            No {noun}s are listed yet. Check back soon.
          </Text>
        )}

        {!loading && !failed && items.length > 0 && (
          <>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12 }} className="font-sans">
              {shown.length} {shown.length === 1 ? noun : `${noun}s`}{narrowed ? ' match' : ''}
            </Text>
            {shown.map((item) => (
              <ListingCard
                key={String(item.id)}
                item={item}
                chips={cardChips(item, category?.list.chips ?? ['format', 'duration', 'cost', 'place'])}
                onPress={() => router.push({ pathname: '/opportunities/listing/[id]', params: { id: String(item.id), key } } as any)}
              />
            ))}
            {shown.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: Colors.textMuted, marginBottom: 12 }} className="font-sans">Nothing matches your search.</Text>
                <TouchableOpacity onPress={() => { setQuery(''); setFilter('all'); resetFilters(); }} accessibilityRole="button">
                  <Text style={{ color: Colors.primary, fontWeight: '600' }} className="font-sans">Clear search and filters</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}
