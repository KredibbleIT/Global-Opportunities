import { View, Text, TouchableOpacity, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Clock, Share2 } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/design';
import { getCareerArticle, useCareerArticles } from '../../constants/careerResources';

// One career guide, in the same layout as a News article: a purple hero (category pill, title, read time) and a white sheet with the text.

/** Splits a guide's text into blocks: a short first line without a full stop (for example "1. Keep it Concise") is a heading. */
const toBlocks = (content: string) =>
  content
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block.split('\n');
      const isHeading = rest.length > 0 && first.length <= 48 && !/[.:]$/.test(first);
      return isHeading ? { heading: first.replace(/^•\s*/, ''), text: rest.join('\n') } : { heading: null, text: block };
    });

export default function CareerGuideScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  useCareerArticles(); // makes sure the latest list is loaded when the screen is opened directly
  const article = getCareerArticle(String(id));

  if (!article) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.textMuted }}>Guide not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const [lead, ...rest] = toBlocks(article.content);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.primary }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/career-resources' as any))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={26} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={10}
            onPress={() => Share.share({ message: `${article.title}\n\n${article.summary}` })}
            accessibilityRole="button"
            accessibilityLabel="Share"
          >
            <Share2 size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ flexGrow: 1 }}>
        {/* Hero */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -60, top: -30, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <View style={{ backgroundColor: Colors.accent600, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700' }}>{article.category}</Text>
            </View>
          </View>
          <Text style={{ color: Colors.white, fontSize: 26, lineHeight: 34 }} className="font-heading font-extrabold">{article.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 18 }}>
            <Clock size={13} color="rgba(255,255,255,0.8)" />
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{article.duration}</Text>
          </View>
        </View>

        {/* Guide sheet */}
        <View style={{ backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 48, flexGrow: 1 }}>
          {lead && (
            <Text style={{ fontSize: 17, lineHeight: 28, color: Colors.textBody, fontWeight: '600', marginBottom: 18 }}>
              {lead.heading ? `${lead.heading}\n${lead.text}` : lead.text}
            </Text>
          )}
          {rest.map((block, i) => (
            <View key={i} style={{ marginBottom: 18 }}>
              {block.heading && <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.textBody, fontWeight: '700', marginBottom: 4 }}>{block.heading}</Text>}
              <Text style={{ fontSize: 16, lineHeight: 27, color: Colors.textBody }}>{block.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
