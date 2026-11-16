import { useState, useEffect, useCallback } from 'react';
import { Colors } from '../../constants/design';
import { View, Text, TouchableOpacity, ScrollView, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bookmark, Sparkles, Plus, Briefcase } from 'lucide-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { authStore } from '../../constants/authStore';
import { getOpportunities, getApplicants, getOpportunityCategoryCounts } from '../../lib/api';
import { OPPORTUNITY_CATEGORIES, type OpportunityCategory } from '../../constants/opportunityCategories';
import { useSaved } from '../../lib/useSaved';

// ─── Logo ─────────────────────────────────────────────────────────────────────

const LogoSVG = () => (
  <Image 
    source={require('../../../assets/images/logo.png')} 
    style={{ width: 40, height: 40, borderRadius: 20 }} 
    resizeMode="contain" 
  />
);

// ─── Category cards ───────────────────────────────────────────────────────────

// The eight categories: each is its own card artwork with the title and the number of listings on top. The numbers are the listings the admin dashboard has
// approved for the app (GET /opportunities/category-counts), so they change as the admin posts; they are never part of the artwork.
const CategoryCard = ({ category, count, onPress }: { category: OpportunityCategory; count: number | undefined; onPress: () => void }) => {
  // Two cards across with 20px side padding and a 20px gap: the artwork gets that exact size (a percentage size is not reliable here).
  const { width } = useWindowDimensions();
  const cardWidth = (width - 60) / 2;
  // The artwork is 328 x 250: the card keeps that shape, so nothing of the icon is cut off.
  const cardHeight = Math.round((cardWidth * 250) / 328);
  return (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={count === undefined ? category.title : `${category.title}, ${count} listings`}
    style={{ width: cardWidth, height: cardHeight, borderRadius: 16, overflow: 'hidden', padding: 14, justifyContent: 'space-between' }}
  >
    {/* This category's card artwork (purple, with its 3D icon); the title and the number go on top */}
    <Image source={category.card} style={{ position: 'absolute', width: cardWidth, height: cardHeight }} resizeMode="cover" />
    <Text numberOfLines={3} style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '500', width: '78%' }} className="font-sans">
      {category.title}
    </Text>
    <Text style={{ color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '700' }} className="font-sans">
      {count === undefined ? '' : count}
    </Text>
  </TouchableOpacity>
  );
};

// ─── Job cards ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#F87171', '#60A5FA', '#34D399'];

const AvatarStack = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {AVATAR_COLORS.map((color, i) => (
      <View
        key={i}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: '#F7F7F9',
          marginLeft: i === 0 ? 0 : -8,
          zIndex: AVATAR_COLORS.length - i,
        }}
      />
    ))}
  </View>
);

type Job = {
  id: string;
  title: string;
  location: string;
  company: string;
  logoColor: string;
  initial: string;
  description: string;
  applied: string;
  match: string;
};

// Real listings from the API, so saved ids match the Saved opportunities list.
const toJob = (o: any): Job => ({
  id: String(o.id || o._id),
  title: o.title,
  location: o.location || 'Remote',
  company: o.company || 'Company',
  logoColor: o.logoColor || Colors.primary,
  initial: (o.company || 'J').charAt(0).toUpperCase(),
  description: o.description || '',
  applied: `${o.applicantsCount || 0} applied`,
  match: '92% Match',
});

const JobCard = ({ job, onPress }: { job: Job; onPress: () => void }) => {
  const [isSaved, toggleSave] = useSaved(job.id, 'jobs');
  return (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={{
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    }}
  >
    {/* Logo + title + bookmark */}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View
        style={{
          width: 37,
          height: 37,
          borderRadius: 12,
          backgroundColor: job.logoColor,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 8,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' }}>{job.initial}</Text>
      </View>

      <View style={{ flex: 1, marginRight: 8 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: '#1A1A1A' }} className="font-sans">
          {job.title}
          <Text style={{ color: '#8A8D9F' }}> · {job.location}</Text>
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: '#8A8D9F', marginTop: 2 }} className="font-sans">
          {job.company}
        </Text>
      </View>

      <TouchableOpacity
        onPress={toggleSave}
        accessibilityRole="button"
        accessibilityLabel={isSaved ? 'Remove from saved' : 'Save opportunity'}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 1,
          borderColor: isSaved ? Colors.primary : '#E5E6F2',
          backgroundColor: isSaved ? Colors.primary : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Bookmark size={16} color={isSaved ? '#FFFFFF' : '#8A8D9F'} fill={isSaved ? '#FFFFFF' : 'transparent'} />
      </TouchableOpacity>
    </View>

    {/* Description */}
    <Text
      style={{ fontSize: 13, color: '#8A8D9F', marginTop: 10, lineHeight: 18 }}
      numberOfLines={2}
      className="font-sans"
    >
      {job.description}
    </Text>

    {/* Divider */}
    <View style={{ height: 1, backgroundColor: '#E5E6F2', marginTop: 10 }} />

    {/* Avatars + match badge */}
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AvatarStack />
        <Text style={{ fontSize: 10, color: '#8A8D9F' }} className="font-sans">
          {job.applied}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#DCFCE7',
          borderRadius: 9999,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}
      >
        <Sparkles size={13} color="#16A34A" />
        <Text style={{ fontSize: 10, color: '#16A34A', fontWeight: '500' }} className="font-sans">
          {job.match}
        </Text>
      </View>
    </View>
  </TouchableOpacity>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OpportunitiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const viewMode = params.view;
  const [role, setRole] = useState(authStore.role);
  const [opps, setOpps] = useState(authStore.opportunities);
  const [recommended, setRecommended] = useState<Job[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number> | undefined>(undefined);
  const [recruiterActiveTab, setRecruiterActiveTab] = useState<'Jobs' | 'Internships' | 'Grants' | 'Events'>('Jobs');

  useEffect(() => {
    // State is initialised from authStore; the subscription keeps it in sync.
    const unsubscribe = authStore.subscribe(() => {
      setRole(authStore.role);
      setOpps([...authStore.opportunities]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (role === 'hirer') {
        const fetchOpps = async () => {
          try {
            const data = await getOpportunities();
            const oppsWithApplicants = await Promise.all(
              data.map(async (opp: any) => {
                try {
                  const applicants = await getApplicants(opp.id);
                  return { ...opp, applicants, applicantsCount: applicants.length || opp.applicantsCount || 0 };
                } catch {
                  return { ...opp, applicants: [], applicantsCount: 0 };
                }
              })
            );
            authStore.setOpportunities(oppsWithApplicants);
          } catch (err) {
            console.error(err);
          }
        };
        fetchOpps();
      }
    }, [role])
  );

  // The category numbers load each time the screen comes into view, so a listing the admin approved since shows when the person returns.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getOpportunityCategoryCounts()
        .then((data) => { if (active) setCounts(data); })
        .catch(() => { /* keep the last numbers; the cards still open */ });
      return () => { active = false; };
    }, [])
  );

  useEffect(() => {
    let active = true;
    getOpportunities({ type: 'jobs' })
      .then((data: any) => { if (active) setRecommended((Array.isArray(data) ? data : []).slice(0, 5).map(toJob)); })
      .catch(() => {})
      .finally(() => { if (active) setRecommendedLoading(false); });
    return () => { active = false; };
  }, []);
  if (role === 'hirer') {
    if (viewMode !== 'all') {
      const filteredOpps = opps.filter((opp) => opp.type.toLowerCase() === recruiterActiveTab.toLowerCase());

      // ─── ACTIVE LISTINGS FEED ─────────────────────────────────────────
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F9' }} edges={['top', 'left', 'right']}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <View style={{ width: 60, alignItems: 'flex-start' }}>
              <LogoSVG />
            </View>
            <Text
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 17,
                fontWeight: '600',
                color: '#1A1A1A',
              }}
              className="font-sans"
            >
              Active Posts
            </Text>
            <View style={{ width: 60, alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => router.push('/opportunities/create')}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 }}
              >
                <Plus size={14} color="#FFFFFF" />
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }} className="font-sans">Post</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* Category Tabs Selector */}
            <View style={{ 
              backgroundColor: '#FFFFFF', 
              borderRadius: 14, 
              padding: 4, 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              marginBottom: 20,
              borderWidth: 1,
              borderColor: '#E5E6F2'
            }}>
              {(['Jobs', 'Internships', 'Grants', 'Events'] as const).map((tab) => {
                const isActive = recruiterActiveTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setRecruiterActiveTab(tab)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      alignItems: 'center',
                      borderRadius: 10,
                      backgroundColor: isActive ? Colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{ 
                      fontSize: 13, 
                      fontWeight: isActive ? '600' : '500', 
                      color: isActive ? '#FFFFFF' : '#8A8D9F' 
                    }} className="font-sans">
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredOpps.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
                <Briefcase size={64} color="#A1A1AA" style={{ marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' }} className="font-sans">No Listings Yet</Text>
                <Text style={{ fontSize: 12, color: '#8A8D9F', marginTop: 4, textAlign: 'center' }} className="font-sans">
                  Click the &quot;+ Post&quot; button above to publish your first {recruiterActiveTab.toLowerCase()}.
                </Text>
              </View>
            ) : (
              <View>
                {filteredOpps.map((opp) => (
                  <TouchableOpacity
                    key={opp.id}
                    onPress={() => router.push({ pathname: '/opportunities/[id]', params: { id: opp.id } })}
                    activeOpacity={0.85}
                    style={{ 
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    {/* Event Banner (only for events with a banner) */}
                    {opp.type === 'events' && opp.eventBannerUri && (
                      <Image
                        source={{ uri: opp.eventBannerUri }}
                        style={{
                          width: '100%',
                          height: 110,
                          borderRadius: 10,
                          marginBottom: 12,
                          backgroundColor: Colors.primaryTransparent,
                        }}
                        resizeMode="cover"
                      />
                    )}
                    {/* Top Row: Logo, Title/Location, Type Badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      {opp.type === 'grants' && opp.grantLogoUri ? (
                        <Image
                          source={{ uri: opp.grantLogoUri }}
                          style={{
                            width: 37, height: 37, borderRadius: 18,
                            marginRight: 8,
                            backgroundColor: Colors.primaryTransparent,
                          }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{
                          width: 37, height: 37, borderRadius: 12,
                          backgroundColor: opp.logoColor,
                          justifyContent: 'center', alignItems: 'center',
                          marginRight: 8,
                        }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>{opp.initial}</Text>
                        </View>
                      )}

                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: '#1A1A1A' }} className="font-sans">
                          {opp.title}
                          <Text style={{ color: '#8A8D9F', fontWeight: '400' }}> · {opp.location}</Text>
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '400', color: '#8A8D9F', marginTop: 2 }} className="font-sans">
                          {authStore.company?.name || 'Company'}
                        </Text>
                      </View>

                      <View style={{ backgroundColor: Colors.primaryTransparent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '600', textTransform: 'capitalize' }} className="font-sans">{opp.type}</Text>
                      </View>
                    </View>

                    {/* Description */}
                    <Text
                      style={{ fontSize: 13, fontWeight: '400', color: '#8A8D9F', marginTop: 10, lineHeight: 18 }}
                      numberOfLines={2}
                      className="font-sans"
                    >
                      {opp.description}
                    </Text>

                    {/* Divider */}
                    <View style={{ height: 1, backgroundColor: '#E5E6F2', marginTop: 10 }} />

                    {/* Footer */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {['#F87171', '#60A5FA', '#34D399'].map((color, i) => (
                            <View
                              key={i}
                              style={{
                                width: 24, height: 24, borderRadius: 12,
                                backgroundColor: color,
                                borderWidth: 2, borderColor: '#F7F7F9',
                                marginLeft: i === 0 ? 0 : -8,
                                zIndex: 3 - i,
                              }}
                            />
                          ))}
                        </View>
                        <Text style={{ fontSize: 12, color: '#8A8D9F' }} className="font-sans">
                          {opp.applicants.length > 0 ? `${opp.applicants.length} applied` : '0 applied'}
                        </Text>
                      </View>

                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: Colors.primaryTransparent, borderRadius: 9999,
                        paddingHorizontal: 12, paddingVertical: 5,
                      }}>
                        <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '500' }} className="font-sans">
                          Review Applicants →
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>


        </SafeAreaView>
      );
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F9' }} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <View style={{ width: 60, alignItems: 'flex-start' }}>
          <LogoSVG />
        </View>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 17,
            fontWeight: '600',
            color: '#1A1A1A',
          }}
          className="font-sans"
        >
          Opportunities listing
        </Text>
        <View style={{ width: 60, alignItems: 'flex-end' }}>
          {role === 'hirer' ? (
            <TouchableOpacity
              onPress={() => router.push('/opportunities/create')}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 }}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }} className="font-sans">Post</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Category grid: two across, the eight categories */}
        {Array.from({ length: OPPORTUNITY_CATEGORIES.length / 2 }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 20, marginBottom: row === OPPORTUNITY_CATEGORIES.length / 2 - 1 ? 24 : 20 }}>
            {OPPORTUNITY_CATEGORIES.slice(row * 2, row * 2 + 2).map((category) => (
              <CategoryCard
                key={category.key}
                category={category}
                count={counts?.[category.key]}
                onPress={() => router.push(category.route as any)}
              />
            ))}
          </View>
        ))}

        {/* Recommended header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#1A1A1A', opacity: 0.6 }} className="font-sans">
            Recommended
          </Text>
          <TouchableOpacity onPress={() => router.push('/recommended' as any)}>
            <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }} className="font-sans">
              See All
            </Text>
          </TouchableOpacity>
        </View>

        {/* Job listings */}
        {!recommendedLoading && recommended.length === 0 && (
          <Text style={{ fontSize: 13, color: '#8A8D9F', textAlign: 'center', paddingVertical: 24 }} className="font-sans">
            No recommended jobs yet.
          </Text>
        )}
        {recommended.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
