import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, SlidersHorizontal, Star, Check, BadgeCheck } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { getExperts, PublicExpert } from '../../lib/api';

// ─── Logo ─────────────────────────────────────────────────────────────────────
const LogoSVG = () => (
  <Image
    source={require('../../../assets/images/logo.png')}
    style={{ width: 40, height: 40, borderRadius: 20 }}
    resizeMode="contain"
  />
);

// ─── Star Rating Component ────────────────────────────────────────────────────
const StarRating = ({ rating }: { rating: number }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={14}
        color={i <= rating ? '#F6B612' : '#C4C4C4'}
        fill={i <= rating ? '#F6B612' : 'transparent'}
        style={{ marginRight: 2 }}
      />
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 13, color: Colors.textMuted, marginRight: 6, fontWeight: '500' }} className="font-sans">
        {rating.toFixed(1)}
      </Text>
      {stars}
    </View>
  );
};

// ─── Expert Card Component ────────────────────────────────────────────────────
const ExpertAvatar = ({ expert, size, radius }: { expert: Pick<PublicExpert, 'name' | 'image'>; size: number; radius: number }) => {
  const [failed, setFailed] = useState(false);
  if (expert.image && !failed) {
    return <Image source={{ uri: expert.image }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: radius, backgroundColor: Colors.bgAlt }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: Colors.primary }}>{(expert.name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
};

const ExpertCard = ({ expert, onPress }: { expert: PublicExpert; onPress: () => void }) => {
  return (
    <TouchableOpacity
      testID={`expert-card-${expert.id}`}
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <View style={{ marginRight: 12 }}>
          <ExpertAvatar expert={expert} size={44} radius={12} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
            <Text style={{ fontSize: 13, color: Colors.textHeading, fontWeight: FontWeight.medium, flexShrink: 1 }} className="font-sans">
              {expert.name}
              <Text style={{ color: Colors.textMuted, fontWeight: FontWeight.regular }}> · {expert.profession}</Text>
            </Text>
            {expert.verified && (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#16A34A', justifyContent: 'center', alignItems: 'center', marginLeft: 6 }}>
                <Check size={10} color="#FFFFFF" strokeWidth={3} />
              </View>
            )}
          </View>
          {!!(expert.university || expert.location) && (
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2, fontWeight: '400' }} className="font-sans">
              {expert.university || expert.location}
            </Text>
          )}
          {!!expert.bio && (
            <Text numberOfLines={2} style={{ fontSize: 13, color: Colors.textMuted, marginTop: 8, lineHeight: 18, fontWeight: '400' }} className="font-sans">
              {expert.bio}
            </Text>
          )}
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: Colors.borderDefault, marginVertical: 12 }} />
      <View style={{ flexDirection: 'row', justifyContent: expert.ratingCount > 0 ? 'space-between' : 'flex-start', alignItems: 'center' }}>
        {/* The rating only appears once someone has rated this expert. */}
        {expert.ratingCount > 0 && <StarRating rating={expert.rating} />}
        <Text style={{ fontSize: 12, color: Colors.textMuted }} className="font-sans">
          {expert.country || expert.location}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function CareerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    query?: string;
    city?: string;
    profession?: string;
    experience?: string;
    rating?: string;
    country?: string;
    skills?: string;
  }>();

  const [role, setRole] = useState(authStore.role);
  // What was last loaded, and for which search: a different search means the list is loading again.
  const [result, setResult] = useState<{ key: string; experts: PublicExpert[]; failed: boolean } | null>(null);
  const queryKey = JSON.stringify([params.query, params.city, params.profession, params.experience, params.rating, params.country, params.skills]);
  const isLoading = result?.key !== queryKey;
  const experts = result?.experts ?? [];
  const loadFailed = Boolean(result?.failed);

  useEffect(() => {
    // State is initialised from authStore; the subscription keeps it in sync.
    const unsubscribe = authStore.subscribe(() => setRole(authStore.role));
    return unsubscribe;
  }, []);

  // The approved experts, for seekers and hirers alike; the search and filters are applied by the server.
  useEffect(() => {
    let active = true;
    getExperts({
      q: params.query,
      city: params.city,
      profession: params.profession,
      experience: params.experience,
      rating: params.rating,
      country: params.country,
      skills: params.skills,
    })
      .then((data) => { if (active) setResult({ key: queryKey, experts: Array.isArray(data) ? data : [], failed: false }); })
      .catch(() => { if (active) setResult({ key: queryKey, experts: [], failed: true }); });
    return () => { active = false; };
  }, [queryKey, params.query, params.city, params.profession, params.experience, params.rating, params.country, params.skills]);

  const getFilterCount = () => {
    let count = 0;
    if (params.city) count += 1;
    if (params.profession) count += params.profession.split(',').length;
    if (params.experience) count += params.experience.split(',').length;
    if (params.rating) count += params.rating.split(',').length;
    if (params.country) count += params.country.split(',').length;
    if (params.skills) count += params.skills.split(',').length;
    return count;
  };

  const filterCount = getFilterCount();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <LogoSVG />
        <Text style={{ flex: 1, textAlign: 'center', fontSize: FontSize.screenTitle, fontWeight: FontWeight.semibold, color: Colors.textHeading, marginRight: 40 }} className="font-sans">
          {role === 'hirer' ? 'Talent Directory' : 'Expert listing'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/experts/search')}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.searchBar, paddingHorizontal: 16, height: 50, }}
          >
            <Search size={18} color={Colors.textPlaceholder} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, fontSize: 13, color: Colors.textPlaceholder }} className="font-sans">
              {params.query || (role === 'hirer' ? 'Search talent by skills, role...' : 'Search for experts')}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/experts/filter', params })}
              style={{ width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
            >
              <SlidersHorizontal size={18} color={Colors.primary} />
              {filterCount > 0 && (
                <View style={{ position: 'absolute', top: -2, right: -2, backgroundColor: Colors.primary, borderRadius: 9, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: Colors.white, fontSize: 10, fontWeight: 'bold' }}>{filterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {filterCount > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {params.query && <View style={{ backgroundColor: Colors.primaryChip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full }}><Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }}>Search: {params.query}</Text></View>}
            {params.skills && <View style={{ backgroundColor: Colors.primaryChip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full }}><Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }}>Skills ({params.skills.split(',').length})</Text></View>}
            {params.country && <View style={{ backgroundColor: Colors.primaryChip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full }}><Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }}>Country ({params.country.split(',').length})</Text></View>}
            <TouchableOpacity onPress={() => router.replace('/career')} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, color: Colors.error, fontWeight: '600' }}>Clear All</Text>
            </TouchableOpacity>
          </View>
        )}

        {role === 'seeker' && (
          <TouchableOpacity
            testID="become-expert"
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => router.push('/experts/apply' as never)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryChip, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, gap: 10 }}
          >
            <BadgeCheck size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primary }} className="font-sans">Be listed as an expert</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }} className="font-sans">Show your profile to other people on Global Opportunity Desk.</Text>
            </View>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : experts.length > 0 ? (
          experts.map(expert => (
            <ExpertCard key={expert.id} expert={expert} onPress={() => router.push(`/experts/${expert.id}`)} />
          ))
        ) : (
          <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 14, color: Colors.textMuted, textAlign: 'center' }} className="font-sans">
              {loadFailed
                ? 'We could not load the experts. Check your connection and try again.'
                : filterCount > 0
                  ? 'No experts match your search.'
                  : 'No experts are listed yet.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
