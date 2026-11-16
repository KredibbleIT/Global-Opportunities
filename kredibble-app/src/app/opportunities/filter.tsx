import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, ChevronUp, Search, MapPin, Wallet, Layers, Tag, BadgeCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/design';
import { getOpportunityCategory } from '../../constants/opportunityCategories';
import { BottomSafeBar } from '../../components/ui/BottomSafeBar';
import { categoryFilterCount, categoryFilters } from '../../lib/categoryFilterStore';
import { FACET_LABELS, type FacetField, type FacetSelection } from '../../lib/opportunityListing';

// The filter page of an opportunity category (volunteering, scholarships, fellowships, training, mentorship), built like the Jobs and Events filter
// pages: a header, the search bar, a "Filter" label, white sections that open to a list of choices, and Reset Filters / Apply Filters at the bottom.
// The sections are the details the admin dashboard saved for the category; the choices are the values its listings really have.

const SECTION_ICON = { funding: Wallet, level: Layers, focus: Tag } as const;

// ─── Sub-components (the same as the Jobs filter) ─────────────────────────────

const RadioButton = ({ selected }: { selected: boolean }) => (
  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: selected ? Colors.primary : '#C4C4C4', justifyContent: 'center', alignItems: 'center' }}>
    {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} />}
  </View>
);

const OptionRow = ({ Icon, label, selected, onPress }: { Icon: any; label: string; selected: boolean; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
    <Icon size={18} color={selected ? Colors.primary : '#A1A1AA'} style={{ marginRight: 12 }} />
    <Text style={{ flex: 1, fontSize: 12, color: selected ? Colors.primary : '#1A1A1A', fontWeight: selected ? '500' : '400' }} className="font-sans">
      {label}
    </Text>
    <RadioButton selected={selected} />
  </TouchableOpacity>
);

const SectionHeader = ({ Icon, label, count, isOpen, hasSelections, onToggle }: { Icon: any; label: string; count: number; isOpen: boolean; hasSelections: boolean; onToggle: () => void }) => (
  <TouchableOpacity onPress={onToggle} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
    <Icon size={20} color={hasSelections ? Colors.primary : '#A1A1AA'} style={{ marginRight: 12 }} />
    <Text style={{ fontSize: 12, color: hasSelections ? Colors.primary : '#8A8D9F', fontWeight: '500' }} className="font-sans">
      {label}
    </Text>
    {count > 0 && (
      <View style={{ backgroundColor: Colors.primary, borderRadius: 9999, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}>
        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{count}</Text>
      </View>
    )}
    <View style={{ flex: 1 }} />
    {isOpen ? <ChevronUp size={18} color="#A1A1AA" /> : <ChevronDown size={18} color="#A1A1AA" />}
  </TouchableOpacity>
);

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FilterCategoryScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const category = getOpportunityCategory(key);
  const saved = categoryFilters.get(String(key));
  const options = categoryFilters.getOptions(String(key));

  const [selection, setSelection] = useState<FacetSelection>(saved.selection);
  const [certificateOnly, setCertificateOnly] = useState(saved.certificateOnly);
  const [location, setLocation] = useState(saved.location);
  const [openSection, setOpenSection] = useState<FacetField | null>(null);

  const facets = (category?.list.facets ?? []).filter((field) => (options[field] ?? []).length > 0);
  const filterCount = categoryFilterCount({ selection, certificateOnly, location });

  const toggleValue = (field: FacetField, value: string) =>
    setSelection((current) => {
      const chosen = current[field] ?? [];
      return { ...current, [field]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value] };
    });

  const handleApply = () => {
    categoryFilters.set(String(key), { selection, certificateOnly, location: location.trim() });
    router.back();
  };

  const handleReset = () => {
    setSelection({});
    setCertificateOnly(false);
    setLocation('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F9' }} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/opportunities'))} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 32 }}>
          <ChevronLeft size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#1A1A1A' }} className="font-sans">
          Filter {category?.list.noun ? `${category.list.noun}s` : 'listings'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Search bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, paddingHorizontal: 16, height: 50, marginBottom: 8 }}>
          <Search size={18} color="#A1A1AA" style={{ marginRight: 10 }} />
          <Text style={{ flex: 1, fontSize: 12, color: '#A1A1AA' }} className="font-sans">
            {category?.list.placeholder ?? 'Search'}
          </Text>
        </View>

        {/* Filter label */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }} className="font-sans">Filter</Text>
        </View>

        {/* Location */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}>
          <MapPin size={18} color="#A1A1AA" style={{ marginRight: 12 }} />
          <TextInput
            placeholder="Enter city, region or country"
            placeholderTextColor="#A1A1AA"
            value={location}
            onChangeText={setLocation}
            style={{ flex: 1, fontSize: 12, color: '#1A1A1A', outline: 'none' } as any}
            className="font-sans"
          />
        </View>

        {/* One section for each detail the category has */}
        {facets.map((field) => {
          const Icon = SECTION_ICON[field];
          const chosen = selection[field] ?? [];
          return (
            <View key={field} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
              <SectionHeader
                Icon={Icon}
                label={FACET_LABELS[field]}
                count={chosen.length}
                isOpen={openSection === field}
                hasSelections={chosen.length > 0}
                onToggle={() => setOpenSection((current) => (current === field ? null : field))}
              />
              {openSection === field && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  {(options[field] ?? []).map((value) => (
                    <OptionRow key={value} Icon={Icon} label={value} selected={chosen.includes(value)} onPress={() => toggleValue(field, value)} />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* The certificate, for the categories that have one */}
        {!!category?.list.certificate && (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, paddingHorizontal: 16 }}>
            <OptionRow Icon={BadgeCheck} label={category.list.certificate} selected={certificateOnly} onPress={() => setCertificateOnly((value) => !value)} />
          </View>
        )}

        {facets.length === 0 && !category?.list.certificate && (
          <Text style={{ color: '#8A8D9F', fontSize: 12, textAlign: 'center', paddingVertical: 24 }} className="font-sans">
            There are no details to filter by yet. Search by city, region or country above.
          </Text>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <BottomSafeBar
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          flexDirection: 'row', gap: 12,
          paddingHorizontal: 20, paddingVertical: 16,
          backgroundColor: '#F7F7F9',
          borderTopWidth: 1, borderTopColor: '#E5E6F2',
        }}
      >
        <TouchableOpacity
          onPress={handleReset}
          accessibilityRole="button"
          style={{ flex: 1, height: 47, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, color: Colors.primary, fontWeight: '500' }} className="font-sans">Reset Filters</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleApply}
          accessibilityRole="button"
          style={{ flex: 2, height: 47, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '600' }} className="font-sans">
            Apply Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </BottomSafeBar>
    </SafeAreaView>
  );
}
