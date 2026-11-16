import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, FileText, MessageSquare, Compass, BookOpen, Search, X, type LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius } from '../../constants/design';
import { CAREER_CATEGORIES, useCareerArticles, type CareerArticle } from '../../constants/careerResources';
import { Header } from '../../components/ui/Header';

// The Career resources center uses the same design and structure as the News screen: a header, a row of featured guides you swipe
// through, category chips, then the list of guides with an icon tile. A guide opens on its own screen (career-resources/[id]).

const CATEGORY_ICON: Record<string, LucideIcon> = {
  'Resume Writing': FileText,
  'Interview Prep': MessageSquare,
  'Career Planning': Compass,
};

const FeaturedCard = ({ item, width, onPress }: { item: CareerArticle; width: number; onPress: () => void }) => {
  const Icon: LucideIcon = CATEGORY_ICON[item.category] ?? BookOpen;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{ width, height: 210, borderRadius: Radius.card, backgroundColor: Colors.primary, overflow: 'hidden', padding: 16, justifyContent: 'space-between' }}
    >
      {/* Soft decorative shapes */}
      <View style={{ position: 'absolute', right: -50, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ position: 'absolute', right: 24, bottom: -42, opacity: 0.18 }}>
        <Icon size={120} color={Colors.white} strokeWidth={1.2} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: Colors.accent600, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700' }}>{item.category}</Text>
        </View>
      </View>

      <View>
        <Text numberOfLines={3} style={{ color: Colors.white, fontSize: 18, lineHeight: 25 }} className="font-heading font-bold">
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
          <Clock size={13} color="rgba(255,255,255,0.8)" />
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{item.duration}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const GuideRow = ({ item, onPress }: { item: CareerArticle; onPress: () => void }) => {
  const Icon: LucideIcon = CATEGORY_ICON[item.category] ?? BookOpen;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{ backgroundColor: Colors.bgCard, borderRadius: Radius.card, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 14 }}
    >
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.accent700, marginBottom: 4 }}>{item.category.toUpperCase()}</Text>
          <Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 21, color: Colors.textBody }} className="font-heading font-semibold">
            {item.title}
          </Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, color: Colors.textMuted, marginTop: 10 }}>
          {item.summary}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: Colors.primary10, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={36} color={Colors.primary} strokeWidth={1.6} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Clock size={12} color={Colors.textMuted} />
          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{item.duration}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function CareerResourcesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const articles = useCareerArticles();
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  const featured = articles.slice(0, 3);
  const term = query.trim().toLowerCase();
  const guides = articles.filter(
    (a) => (category === 'All' || a.category === category) && (!term || a.title.toLowerCase().includes(term) || a.summary.toLowerCase().includes(term)),
  );
  const cardWidth = width - 40 - 24;
  const open = (id: string) => router.push({ pathname: '/career-resources/[id]', params: { id } } as any);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      <Header title="Career Resources" showBack onBackPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* Search (kept from the earlier screen) */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.searchBar, paddingHorizontal: 16, height: 48 }}>
            <Search size={18} color="#A1A1AA" style={{ marginRight: 10 }} />
            <TextInput
              placeholder="Search guides and playbooks..."
              placeholderTextColor="#A1A1AA"
              value={query}
              onChangeText={setQuery}
              style={{ flex: 1, fontSize: 14, color: Colors.textBody }}
              className="font-sans"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
                <X size={16} color="#A1A1AA" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Featured guides */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 20, color: Colors.textBody }} className="font-heading font-bold">Featured Guides</Text>
          <Text style={{ fontSize: 12, color: Colors.textMuted }}>{articles.length} {articles.length === 1 ? 'guide' : 'guides'}</Text>
        </View>

        <FlatList
          data={featured}
          horizontal
          keyExtractor={(a) => String(a.id)}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + 12}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => <FeaturedCard item={item} width={cardWidth} onPress={() => open(String(item.id))} />}
        />

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginTop: 24 }}>
          {(['All', ...CAREER_CATEGORIES] as const).map((c) => {
            const active = category === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={{
                  paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center',
                  backgroundColor: active ? Colors.primary : Colors.bgCard,
                  borderWidth: 1, borderColor: active ? Colors.primary : Colors.borderDefault,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? Colors.white : Colors.textMuted }}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* All guides */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 20, color: Colors.textBody, marginBottom: 12 }} className="font-heading font-bold">All Guides</Text>
          {guides.map((item) => <GuideRow key={String(item.id)} item={item} onPress={() => open(String(item.id))} />)}
          {guides.length === 0 && (
            <Text style={{ textAlign: 'center', color: Colors.textMuted, paddingVertical: 32 }}>No guides match your search.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
