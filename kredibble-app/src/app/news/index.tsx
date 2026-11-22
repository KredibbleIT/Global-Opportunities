import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bookmark, Clock, Newspaper } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius } from '../../constants/design';
import { NewsArticle, initialsOf, useNews, useNewsSaved } from '../../lib/news';
import { Header } from '../../components/ui/Header';
import { useToast } from '../../components/ui/ToastProvider';

const Avatar = ({ name, size = 28, light = false }: { name: string; size?: number; light?: boolean }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: light ? 'rgba(255,255,255,0.2)' : Colors.primary10,
    alignItems: 'center', justifyContent: 'center',
  }}>
    <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: light ? Colors.white : Colors.primary }}>{initialsOf(name)}</Text>
  </View>
);

const SaveButton = ({ id, light }: { id: string; light?: boolean }) => {
  const [saved, toggle] = useNewsSaved(id);
  const { showToast } = useToast();
  return (
    <TouchableOpacity
      onPress={() => showToast(toggle() ? 'Article saved' : 'Removed from saved', 'info')}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save article'}
      hitSlop={10}
    >
      <Bookmark
        size={20}
        color={light ? Colors.white : saved ? Colors.primary : Colors.textMuted}
        fill={saved ? (light ? Colors.white : Colors.primary) : 'transparent'}
      />
    </TouchableOpacity>
  );
};

const FeaturedCard = ({ item, width, onPress }: { item: NewsArticle; width: number; onPress: () => void }) => (
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={onPress}
    style={{ width, height: 210, borderRadius: Radius.card, backgroundColor: Colors.primary, overflow: 'hidden', padding: 16, justifyContent: 'space-between' }}
  >
    {item.imageUrl ? (
      <>
        <Image source={{ uri: item.imageUrl }} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} resizeMode="cover" />
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(60,20,90,0.55)' }} />
      </>
    ) : (
      <View style={{ position: 'absolute', right: -50, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.08)' }} />
    )}

    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ backgroundColor: Colors.accent600, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700' }}>{item.sourceName}</Text>
      </View>
      <SaveButton id={item.id} light />
    </View>

    <View>
      <Text numberOfLines={3} style={{ color: Colors.white, fontSize: 18, lineHeight: 25 }} className="font-heading font-bold">
        {item.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
        <Avatar name={item.sourceName} light />
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{item.date}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

const PostRow = ({ item, onPress }: { item: NewsArticle; onPress: () => void }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    style={{ backgroundColor: Colors.bgCard, borderRadius: Radius.card, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 14 }}
  >
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View>
        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.accent700, marginBottom: 4 }}>{item.sourceName.toUpperCase()}</Text>
        <Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 21, color: Colors.textBody }} className="font-heading font-semibold">
          {item.title}
        </Text>
      </View>
      {!!item.date && <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 12 }}>{item.date}</Text>}
    </View>

    <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: Colors.primary10 }} resizeMode="cover" />
      ) : (
        <View style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: Colors.primary10, alignItems: 'center', justifyContent: 'center' }}>
          <Newspaper size={36} color={Colors.primary} strokeWidth={1.6} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <Clock size={12} color={Colors.textMuted} />
        <Text style={{ fontSize: 11, color: Colors.textMuted }}>{item.readMinutes} min</Text>
      </View>
    </View>
  </TouchableOpacity>
);

export default function NewsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { articles, loading, failed } = useNews('all');
  const [source, setSource] = useState<string>('all');

  // The filter chips are the sources the feed has articles from.
  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    articles.forEach(article => seen.set(article.source, article.sourceName));
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [articles]);

  const main = articles.slice(0, 3);
  const posts = articles.filter(article => source === 'all' || article.source === source);
  const cardWidth = width - 40 - 24;
  const open = (id: string) => router.push({ pathname: '/news/[id]', params: { id } } as any);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      <Header
        title="News"
        showBack
        onBackPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        rightComponent={
            <TouchableOpacity
              onPress={() => router.push('/news/saved' as any)}
              className="w-10 h-10 items-center justify-center bg-white rounded-full border border-border"
              accessibilityRole="button"
              accessibilityLabel="Saved articles"
            >
              <Bookmark size={20} color={Colors.primary} />
            </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : articles.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 }}>
          <Newspaper size={32} color={Colors.textMuted} />
          <Text style={{ marginTop: 12, color: Colors.textMuted, textAlign: 'center' }}>
            {failed ? 'We could not load the news. Check your connection and try again.' : 'No articles yet. Check back soon.'}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Main news */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 4, marginBottom: 12 }}>
            <Text style={{ fontSize: 20, color: Colors.textBody }} className="font-heading font-bold">Main News</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted }}>{today}</Text>
          </View>

          <FlatList
            data={main}
            horizontal
            keyExtractor={n => n.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            renderItem={({ item }) => <FeaturedCard item={item} width={cardWidth} onPress={() => open(item.id)} />}
          />

          {/* Source filter */}
          {sources.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginTop: 24 }}>
              {[{ value: 'all', label: 'All' }, ...sources].map(option => {
                const active = source === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setSource(option.value)}
                    style={{
                      paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center',
                      backgroundColor: active ? Colors.primary : Colors.bgCard,
                      borderWidth: 1, borderColor: active ? Colors.primary : Colors.borderDefault,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? Colors.white : Colors.textMuted }}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Latest posts */}
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Text style={{ fontSize: 20, color: Colors.textBody, marginBottom: 12 }} className="font-heading font-bold">Latest posts</Text>
            {posts.map(item => <PostRow key={item.id} item={item} onPress={() => open(item.id)} />)}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
