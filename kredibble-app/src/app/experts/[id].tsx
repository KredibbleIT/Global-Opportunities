import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Modal, Clipboard, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Star, Check, Copy, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, FontWeight, Radius } from '../../constants/design';
import { getApplicantProfile, getExpert, rateExpert, PublicExpert } from '../../lib/api';

export default function ExpertProfileDetailScreen() {
  const router = useRouter();
  // `applicant` is set when a hirer opens the profile of someone who applied to their listing (the id is then the application's).
  const { id, applicant } = useLocalSearchParams<{ id: string; applicant?: string }>();

  // The expert is loaded from the server: only an approved expert (or you, on your own profile) can be opened.
  const [loaded, setLoaded] = useState<{ id: string; expert: PublicExpert | null } | null>(null);
  const expert = loaded?.id === String(id) ? loaded.expert : null;
  const loading = loaded?.id !== String(id);

  // States for rating modal and toast banner
  const [isRateModalVisible, setIsRateModalVisible] = useState(false);
  const [selectedStars, setSelectedStars] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'email' | 'phone' | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [rating, setRating] = useState(false);

  useEffect(() => {
    let active = true;
    (applicant ? getApplicantProfile(String(id)) : getExpert(String(id)))
      .then((data) => { if (active) setLoaded({ id: String(id), expert: data }); })
      .catch(() => { if (active) setLoaded({ id: String(id), expert: null }); });
    return () => { active = false; };
  }, [id, applicant]);

  // Auto-hide toast banner
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Auto-hide copy feedback
  useEffect(() => {
    if (copyFeedback) {
      const timer = setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copyFeedback]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!expert) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, justifyContent: 'center', alignItems: 'center' }}>
        <AlertCircle size={32} color={Colors.error} />
        <Text style={{ marginTop: 12, fontSize: 15, color: Colors.textMuted }} className="font-sans">
          Expert not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }} className="font-sans">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleCopy = (text: string, type: 'email' | 'phone') => {
    Clipboard.setString(text);
    setCopyFeedback(type);
    Alert.alert('Copied', `${type === 'email' ? 'Email' : 'Phone number'} copied to clipboard!`);
  };

  const openRateModal = () => {
    setSelectedStars(expert.myRating ?? 0);
    setIsRateModalVisible(true);
  };

  const handleRatingSubmit = async () => {
    if (selectedStars < 1 || rating) return;
    setRating(true);
    try {
      const result = await rateExpert(expert.id, selectedStars);
      setLoaded({ id: String(id), expert: { ...expert, rating: result.rating, ratingCount: result.ratingCount, myRating: result.myRating } });
      setIsRateModalVisible(false);
      setShowToast(true);
    } catch (error) {
      Alert.alert('Could not save your rating', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRating(false);
    }
  };

  const contactColumns = [
    expert.contact?.email ? { key: 'email' as const, label: 'Email', value: expert.contact.email } : null,
    expert.contact?.phone ? { key: 'phone' as const, label: 'Phone', value: expert.contact.phone } : null,
  ].filter(Boolean) as { key: 'email' | 'phone'; label: string; value: string }[];

  // Render stars inside rating modal
  const renderInteractiveStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setSelectedStars(i)} style={{ marginHorizontal: 6 }}>
          <Star
            size={32}
            color={i <= selectedStars ? '#F6B612' : '#C4C4C4'}
            fill={i <= selectedStars ? '#F6B612' : 'transparent'}
          />
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 20 }}>{stars}</View>;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top', 'left', 'right', 'bottom']}>
      {/* Toast Feedback Banner */}
      {showToast && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText} className="font-sans">
            Thank you for your feedback!
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleHeaderButton}
        >
          <ChevronLeft size={20} color={Colors.textHeading} />
        </TouchableOpacity>

        {expert.isMe || expert.listed === false ? <View /> : (
        <TouchableOpacity
          testID="rate-expert"
          onPress={openRateModal}
          style={styles.rateButton}
        >
          <Text style={styles.rateButtonText} className="font-sans">
            Rate
          </Text>
          <Star size={14} color="#F6B612" fill="#F6B612" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ backgroundColor: Colors.bgScreen }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card Header Info */}
        <View style={styles.profileHeaderContainer}>
          {expert.image ? (
            <Image source={{ uri: expert.image }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarImage, { backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 36, fontWeight: '700', color: Colors.primary }}>{(expert.name || '?').trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}

          {expert.verified && (
            <View style={styles.verifiedBadge}>
              <View style={styles.verifiedCheckWrapper}>
                <Check size={8} color="#FFFFFF" strokeWidth={3} />
              </View>
              <Text style={styles.verifiedText} className="font-sans">
                Verified Expert
              </Text>
            </View>
          )}

          <Text style={styles.expertName} className="font-sans">
            {expert.name}
          </Text>

          <Text style={styles.expertProfession} className="font-sans">
            {expert.profession}
          </Text>

          {!!expert.contact?.website && (
            <TouchableOpacity onPress={() => Linking.openURL(expert.contact.website!).catch(() => {})} style={{ marginTop: 4 }}>
              <Text style={styles.websiteLink} className="font-sans">
                {expert.contact.website!.replace(/^https?:\/\//i, '')}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.expertLocation} className="font-sans">
            {expert.location}
          </Text>
        </View>

        {/* The contact details the expert chose to show, and the rating once someone has rated them (nothing shows for an unrated expert) */}
        {(() => {
          const cells: React.ReactNode[] = contactColumns.slice(0, 1).map((column) => (
            <TouchableOpacity key={column.key} onPress={() => handleCopy(column.value, column.key)} style={styles.statsCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.statsLabel} className="font-sans">{column.label}</Text>
                <Copy size={11} color={copyFeedback === column.key ? '#16A34A' : Colors.textPlaceholder} />
              </View>
              <Text numberOfLines={1} style={styles.statsValue} className="font-sans">
                {copyFeedback === column.key ? 'Copied!' : column.value}
              </Text>
            </TouchableOpacity>
          ));
          if (expert.ratingCount > 0) {
            cells.push(
              <View key="rating" style={styles.statsCol}>
                <Text style={styles.statsLabel} className="font-sans">Rating</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 2 }}>
                  <Text style={styles.ratingNumber} className="font-sans">{expert.rating.toFixed(1)}</Text>
                  <Star size={10} color="#F6B612" fill="#F6B612" />
                  <Text style={{ fontSize: 10, color: Colors.textMuted, marginLeft: 2 }} className="font-sans">({expert.ratingCount})</Text>
                </View>
              </View>,
            );
          }
          contactColumns.slice(1).forEach((column) => cells.push(
            <TouchableOpacity key={column.key} onPress={() => handleCopy(column.value, column.key)} style={styles.statsCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.statsLabel} className="font-sans">{column.label}</Text>
                <Copy size={11} color={copyFeedback === column.key ? '#16A34A' : Colors.textPlaceholder} />
              </View>
              <Text numberOfLines={1} style={styles.statsValue} className="font-sans">
                {copyFeedback === column.key ? 'Copied!' : column.value}
              </Text>
            </TouchableOpacity>,
          ));
          if (cells.length === 0) return null;
          return (
            <View style={styles.statsCard}>
              {cells.map((cell, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <View style={styles.statsDivider} />}
                  {cell}
                </React.Fragment>
              ))}
            </View>
          );
        })()}

        {/* Panel 1: Professional Summary */}
        {!!(expert.professionalSummary || expert.bio) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} className="font-sans">Professional Summary</Text>
          <Text
            style={styles.bodyText}
            numberOfLines={summaryExpanded ? undefined : 3}
            className="font-sans"
          >
            {expert.professionalSummary || expert.bio}
          </Text>
          {(expert.professionalSummary || expert.bio || '').length > 160 && (
            <TouchableOpacity
              style={styles.readMoreButton}
              onPress={() => setSummaryExpanded(!summaryExpanded)}
            >
              <Text style={styles.readMoreText} className="font-sans">
                {summaryExpanded ? 'Read less' : 'Read more'}
              </Text>
              {summaryExpanded ? <ChevronUp size={14} color={Colors.primary} /> : <ChevronDown size={14} color={Colors.primary} />}
            </TouchableOpacity>
          )}
        </View>
        )}

        {/* Panel 2: Skills & Tools */}
        {(expert.technicalSkills.length > 0 || (expert.softSkills?.length ?? 0) > 0 || (expert.tools?.length ?? 0) > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} className="font-sans">Skills & Tools</Text>

          {([
            ['Technical Skills', expert.technicalSkills],
            ['Soft Skills', expert.softSkills ?? []],
            ['Tools & Technologies', expert.tools ?? []],
          ] as [string, string[]][]).filter(([, list]) => list.length > 0).map(([title, list], index) => (
            <View key={title}>
              <Text style={[styles.subSectionTitle, index > 0 && { marginTop: 16 }]} className="font-sans">{title}</Text>
              <View style={styles.pillContainer}>
                {list.map(item => (
                  <View key={item} style={styles.pillBadge}>
                    <Text style={styles.pillText} className="font-sans">{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
        )}

        {/* Panel 3: Work Experience */}
        {(expert.workExperience?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} className="font-sans">Work Experience</Text>
          {expert.workExperience!.map((exp, idx) => (
            <View key={idx} style={{ marginBottom: idx === expert.workExperience!.length - 1 ? 0 : 20 }}>
              <Text style={styles.experienceTitle} className="font-sans">
                {exp.role}
              </Text>
              <Text style={styles.experienceSub} className="font-sans">
                {exp.company} • {exp.location}
              </Text>
              <Text style={styles.experienceDuration} className="font-sans">
                {exp.duration}
              </Text>
              <View style={{ marginTop: 8 }}>
                {(exp.bullets ?? []).map((bullet, bulletIdx) => (
                  <View key={bulletIdx} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText} className="font-sans">
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
        )}

        {/* Panel 4: Education & Certifications */}
        {((expert.education?.length ?? 0) > 0 || (expert.certifications?.length ?? 0) > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} className="font-sans">Education & Certifications</Text>

          {(expert.education?.length ?? 0) > 0 && <Text style={styles.subSectionTitle} className="font-sans">Education</Text>}
          {(expert.education ?? []).map((edu, idx) => (
            <View key={idx} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: FontWeight.semibold, color: Colors.textHeading }} className="font-sans">
                {edu.degree}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textBody, fontWeight: '300', marginTop: 2 }} className="font-sans">
                {edu.institution} • {edu.duration}
              </Text>
            </View>
          ))}

          {expert.certifications && expert.certifications.length > 0 && (
            <>
              <Text style={[styles.subSectionTitle, { marginTop: 16 }]} className="font-sans">Certifications</Text>
              {expert.certifications.map((cert, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText} className="font-sans">
                    {cert}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
        )}

        {/* Panel 5: Projects */}
        {(expert.projects?.length ?? 0) > 0 && (
        <View style={[styles.section, { borderBottomWidth: 0 }]}>
          <Text style={styles.sectionTitle} className="font-sans">Projects</Text>
          {expert.projects!.map((proj, idx) => (
            <View key={idx} style={{ marginBottom: idx === expert.projects!.length - 1 ? 0 : 16 }}>
              <Text style={{ fontSize: 13, fontWeight: FontWeight.semibold, color: Colors.textHeading, marginBottom: 6 }} className="font-sans">
                {proj.name}
              </Text>
              {(proj.bullets ?? []).map((bullet, bulletIdx) => (
                <View key={bulletIdx} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText} className="font-sans">
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={isRateModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsRateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle} className="font-sans">
              How would you rate this professional?
            </Text>
            <Text style={styles.modalSubtitle} className="font-sans">
              Your feedback will help us evaluate this professional.
            </Text>

            {renderInteractiveStars()}

            <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setIsRateModalVisible(false)}
                style={[styles.modalButton, { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: '#F6B612' }]}
              >
                <Text style={[styles.modalButtonText, { color: '#F6B612' }]} className="font-sans">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="submit-rating"
                onPress={handleRatingSubmit}
                disabled={selectedStars < 1 || rating}
                style={[styles.modalButton, { backgroundColor: '#F6B612', flex: 2, opacity: selectedStars < 1 || rating ? 0.5 : 1 }]}
              >
                <Text style={[styles.modalButtonText, { color: Colors.white, fontWeight: '600' }]} className="font-sans">{rating ? 'Saving…' : 'Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
  },
  circleHeaderButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
  },
  rateButtonText: {
    fontSize: 13,
    color: '#F6B612',
    fontWeight: FontWeight.semibold,
  },
  toastContainer: {
    position: 'absolute',
    top: 24,
    left: 20,
    right: 20,
    backgroundColor: '#F6B612',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  profileHeaderContainer: {
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.bgAlt,
    marginBottom: 12,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginBottom: 10,
  },
  verifiedCheckWrapper: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  verifiedText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
  },
  expertName: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: Colors.textHeading,
    textAlign: 'center',
    marginBottom: 4,
  },
  expertProfession: {
    fontSize: 13,
    color: Colors.textBody,
    fontWeight: '300',
    textAlign: 'center',
  },
  websiteLink: {
    fontSize: 13,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  expertLocation: {
    fontSize: 12,
    color: Colors.textBody,
    fontWeight: '300',
    marginTop: 6,
    textAlign: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
    paddingVertical: 16,
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statsLabel: {
    fontSize: 11,
    color: Colors.textBody,
    fontWeight: '300',
  },
  statsValue: {
    fontSize: 12,
    fontWeight: FontWeight.medium,
    color: Colors.textHeading,
    marginTop: 4,
  },
  ratingNumber: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: Colors.textHeading,
    marginRight: 2,
  },
  statsDivider: {
    width: 1,
    backgroundColor: Colors.borderDefault,
  },
  section: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: Colors.textHeading,
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 11,
    color: Colors.textBody,
    fontWeight: '300',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 13,
    color: Colors.textBody,
    fontWeight: '300',
    lineHeight: 18,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  readMoreText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    marginRight: 4,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  pillBadge: {
    backgroundColor: Colors.bgAlt,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    color: Colors.textBody,
  },
  experienceTitle: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: Colors.textHeading,
  },
  experienceSub: {
    fontSize: 12,
    color: Colors.textBody,
    marginTop: 2,
  },
  experienceDuration: {
    fontSize: 11,
    color: Colors.textBody,
    fontWeight: '300',
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletDot: {
    fontSize: 13,
    color: Colors.textBody,
    fontWeight: '300',
    marginRight: 6,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textBody,
    fontWeight: '300',
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  connectButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textHeading,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textBody,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 15,
  },
});
