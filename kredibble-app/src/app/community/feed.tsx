import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLeaveRemovedChannel } from '../../lib/useChannelRemoved';
import { View, Text, Image, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Bell, BellOff, MoreHorizontal, LogOut, Send, X, Link as LinkIcon, Video,
  Plus, Keyboard, Camera, Mic, Image as ImageIcon, BarChart3, ClipboardList, HelpCircle,
} from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Colors, FontWeight } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { getChannel, getChannelPosts, createChannelPost, uploadFile, setPostReaction, recordPostViews } from '../../lib/api';
import { pickImage, pickCameraImage } from '../../lib/file-picker';
import { socketService } from '../../lib/socket';
import { PostCard } from '../../components/community/PostCard';
import {
  MAX_POST_IMAGES, applyReaction, linkHost, nextReaction, normalizeWebAddress, unseenPostIds, videoInfo, type FeedPost,
} from '../../lib/post-engagement';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AttachAction = 'photo' | 'camera' | 'video' | 'link' | 'Poll' | 'Quiz' | 'Question';
type InteractiveKind = 'Poll' | 'Quiz' | 'Question';
type AddressKind = 'video' | 'link';

const ATTACH_ITEMS: { label: string; Icon: any; color: string; action: AttachAction }[] = [
  { label: 'Photo', Icon: ImageIcon, color: '#8B5CF6', action: 'photo' },
  { label: 'Camera', Icon: Camera, color: '#EF4444', action: 'camera' },
  { label: 'Video', Icon: Video, color: '#EC4899', action: 'video' },
  { label: 'Link', Icon: LinkIcon, color: '#0EA5E9', action: 'link' },
  { label: 'Poll', Icon: BarChart3, color: '#10B981', action: 'Poll' },
  { label: 'Quiz', Icon: ClipboardList, color: '#F59E0B', action: 'Quiz' },
  { label: 'Question', Icon: HelpCircle, color: '#3B82F6', action: 'Question' },
];

/** A picture picked for the next post, shown in the composer until the post is sent. */
interface DraftImage {
  uri: string;
  name: string;
  mimeType?: string;
}

/**
 * A channel's feed. GOD-T89: each post shows its pictures, video and link, and people react (one reaction each), see how many
 * viewed it, and open its responses. The channel's owner writes posts with up to four pictures, a video link and a link.
 */
export default function ChannelFeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const channelId = (params.id as string) || '';
  useLeaveRemovedChannel(channelId);
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<any | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Checking ownership just based on company matching for now (since mock had it)
  const isOwner = authStore.role === 'hirer' && channel?.owner === authStore.company?.name;

  const [announceText, setAnnounceText] = useState('');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  // GOD-T89: what the next post carries besides its text.
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [draftVideo, setDraftVideo] = useState<string | null>(null);
  const [draftLink, setDraftLink] = useState<{ link: string; linkText?: string } | null>(null);
  const [addressSheet, setAddressSheet] = useState<AddressKind | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);

  // Full-screen picture viewer.
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);

  // Interactive Modal State (Poll, Quiz, Question)
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);
  const [interactiveKind, setInteractiveKind] = useState<InteractiveKind>('Poll');
  const [interactiveTitle, setInteractiveTitle] = useState('');
  const [interactiveBody, setInteractiveBody] = useState('');

  // Custom Toast UI State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any | null>(null);

  // Custom Dropdown UI State
  const [showDropdown, setShowDropdown] = useState(false);

  // Posts this visit has already reported as seen, so each is sent once.
  const viewsSent = useRef(new Set<string>());

  const channelPosts = posts.filter(p => !p.channelId || p.channelId === channelId);

  const loadPosts = useCallback(async () => {
    const fetchedPosts = await getChannelPosts(channelId);
    setPosts(fetchedPosts);
  }, [channelId]);

  // Fetch from APIs
  useEffect(() => {
    if (!channelId) return;

    const fetchStoreData = async () => {
      setIsLoading(true);
      try {
        const [ch, fetchedPosts] = await Promise.all([
          getChannel(channelId),
          getChannelPosts(channelId)
        ]);
        setChannel(ch);
        setPosts(fetchedPosts);
      } catch (err) {
        console.error('Error fetching channel data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStoreData();
  }, [channelId]);

  // Coming back from a post's responses: refresh the counts (quietly; the feed is already on screen).
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    if (channelId) loadPosts().catch(() => undefined);
  }, [channelId, loadPosts]));

  // GOD-T89: count the signed-in person as a viewer of the posts they were shown (each post once; the server ignores repeats).
  useEffect(() => {
    if (!channelId || !authStore.user) return;
    const ids = unseenPostIds(channelPosts, viewsSent.current, authStore.user.id);
    if (ids.length === 0) return;
    ids.forEach(id => viewsSent.current.add(id));
    recordPostViews(channelId, ids).catch(() => {
      // A missed view only leaves the count one short; it never blocks the feed.
    });
  }, [channelId, channelPosts]);

  // Real-time socket events
  useEffect(() => {
    if (!channelId) return;

    // connect() is async now that it reads the session token from secure store,
    // so the socket does not exist on the next line. `cancelled` keeps a
    // late-resolving connect() from attaching a listener to an unmounted feed.
    let cancelled = false;
    let attached: any = null;

    const onReceive = (newPost: any) => {
      // If the new post was just created by this user, it's already in the feed
      setPosts(prev => {
        if (prev.find(p => p.id === newPost.id)) return prev;
        return [newPost, ...prev];
      });
    };

    socketService
      .connect()
      .then(() => {
        if (cancelled) return;
        const socket = socketService.socket;
        if (!socket) return;
        attached = socket;
        socket.emit('join_channel', channelId);
        socket.on('receive_message', onReceive);
      })
      .catch(() => {
        // Realtime is an enhancement; the feed still renders from fetchStoreData.
      });

    return () => {
      cancelled = true;
      if (attached) {
        attached.off('receive_message', onReceive);
      }
    };
  }, [channelId]);

  // Show Toast helper
  const triggerToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleToggleMute = () => {
    setNotificationsMuted(prev => {
      const next = !prev;
      if (next) {
        triggerToast('Notifications are muted');
      } else {
        triggerToast('Notifications are active');
      }
      return next;
    });
  };

  const handleUnfollow = () => {
    setShowDropdown(false);
    triggerToast('Unfollowed channel');
    setTimeout(() => {
      router.back();
    }, 500);
  };

  // ─── GOD-T89: reactions, responses, pictures and links on a post ───────────

  const updatePost = (id: string, change: (post: FeedPost) => FeedPost) =>
    setPosts(prev => prev.map(p => (p.id === id ? change(p) : p)));

  /** Shows the reaction at once, then saves it; the server's totals replace the guess, and a failure puts the old ones back. */
  const handleReact = async (post: FeedPost, emoji: string) => {
    if (!authStore.user) {
      triggerToast('Sign in to react to posts');
      return;
    }
    const chosen = nextReaction(post, emoji);
    updatePost(post.id, current => applyReaction(current, chosen));
    try {
      const saved = await setPostReaction(channelId, post.id, chosen);
      updatePost(post.id, current => ({ ...current, ...saved }));
    } catch (err: any) {
      updatePost(post.id, current => ({ ...current, reactions: post.reactions, myReaction: post.myReaction }));
      triggerToast(err?.message || 'Your reaction could not be saved');
    }
  };

  const handleOpenResponses = (post: FeedPost) => {
    if (!authStore.user) {
      triggerToast('Sign in to read and write responses');
      return;
    }
    const excerpt = [post.title, post.body].filter(Boolean).join('\n');
    router.push({
      pathname: '/community/responses',
      params: { channelId, postId: post.id, author: post.authorName ?? '', excerpt: excerpt.slice(0, 300) },
    } as any);
  };

  const handleOpenLink = (address: string) => {
    WebBrowser.openBrowserAsync(address).catch(() => triggerToast('This link could not be opened'));
  };

  // ─── Owner compose bar (WhatsApp-style) ──────────────────────────────────────

  const hasAttachments = draftImages.length > 0 || Boolean(draftVideo) || Boolean(draftLink);
  const canSend = (announceText.trim().length > 0 || draftImages.length > 0 || Boolean(draftVideo)) && !isPosting;

  const clearDraft = () => {
    setAnnounceText('');
    setDraftImages([]);
    setDraftVideo(null);
    setDraftLink(null);
  };

  /** Uploads the picked pictures, then sends the post with its text, pictures, video and link. */
  const handleSendPost = async () => {
    if (!canSend) return;
    setIsPosting(true);
    try {
      const images: string[] = [];
      if (draftImages.length > 0) triggerToast(draftImages.length === 1 ? 'Uploading photo...' : `Uploading ${draftImages.length} photos...`);
      for (const picture of draftImages) {
        images.push((await uploadFile(picture, 'post-images')).url);
      }
      const newPost = await createChannelPost(channelId, {
        body: announceText.trim(),
        ...(images.length ? { images } : {}),
        ...(draftVideo ? { videoUrl: draftVideo } : {}),
        ...(draftLink ? draftLink : {}),
      });
      setPosts(prev => [newPost, ...prev.filter(p => p.id !== newPost.id)]);
      clearDraft();
      triggerToast('Posted to channel');
    } catch (err: any) {
      console.error('Failed to post:', err);
      triggerToast(err?.message || 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  };

  const handlePickImage = async (useCamera = false) => {
    setAttachMenuOpen(false);
    if (draftImages.length >= MAX_POST_IMAGES) {
      triggerToast(`A post can have up to ${MAX_POST_IMAGES} photos`);
      return;
    }
    try {
      const picked = useCamera
        ? await pickCameraImage({ quality: 0.85 })
        : await pickImage({ quality: 0.85 });
      if (!picked) return;
      setDraftImages(prev => [...prev, picked].slice(0, MAX_POST_IMAGES));
    } catch (err: any) {
      triggerToast(err?.message || 'That photo could not be added');
    }
  };

  const openAddressSheet = (kind: AddressKind) => {
    setAttachMenuOpen(false);
    setAddressSheet(kind);
    setAddressInput(kind === 'video' ? draftVideo ?? '' : draftLink?.link ?? '');
    setAddressLabel(kind === 'link' ? draftLink?.linkText ?? '' : '');
    setAddressError(null);
  };

  const saveAddress = () => {
    const address = normalizeWebAddress(addressInput);
    if (!address) {
      setAddressError('Enter a web address, like https://example.com');
      return;
    }
    if (addressSheet === 'video') setDraftVideo(address);
    else setDraftLink({ link: address, ...(addressLabel.trim() ? { linkText: addressLabel.trim() } : {}) });
    setAddressSheet(null);
  };

  const handleOpenInteractive = (kind: InteractiveKind) => {
    setAttachMenuOpen(false);
    setInteractiveKind(kind);
    setInteractiveTitle('');
    setInteractiveBody('');
    setInteractiveModalOpen(true);
  };

  const handleCreateInteractivePost = async () => {
    if (!interactiveBody.trim() || isPosting) return;
    const emoji = interactiveKind === 'Poll' ? '📊' : interactiveKind === 'Quiz' ? '📝' : '❓';
    const postTitle = interactiveTitle.trim() || `${emoji} ${interactiveKind}`;
    setIsPosting(true);
    try {
      const newPost = await createChannelPost(channelId, {
        title: postTitle,
        body: interactiveBody.trim(),
        hasRespondButton: true,
      });
      setPosts(prev => [newPost, ...prev]);
      setInteractiveModalOpen(false);
      setInteractiveTitle('');
      setInteractiveBody('');
      triggerToast(`${interactiveKind} posted`);
    } catch (err: any) {
      console.error(`Failed to post ${interactiveKind}:`, err);
      triggerToast(err?.message || `Failed to post ${interactiveKind}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleAttach = (action: AttachAction) => {
    if (action === 'photo') {
      handlePickImage(false);
    } else if (action === 'camera') {
      handlePickImage(true);
    } else if (action === 'video' || action === 'link') {
      openAddressSheet(action);
    } else {
      handleOpenInteractive(action);
    }
  };

  const handleMicPress = () => {
    setAttachMenuOpen(false);
    triggerToast('Voice messages will be supported in an upcoming update');
  };

  if (isLoading || !channel) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: 12 }} />
        <Text style={{ color: Colors.textMuted }} className="font-sans">Loading channel feed...</Text>
      </SafeAreaView>
    );
  }

  const createdOn = channel.createdAt
    ? new Date(channel.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bgScreen }} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          zIndex: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: '#E5E6F2',
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 8,
          }}
        >
          <ChevronLeft size={20} color={Colors.textHeading} />
        </TouchableOpacity>

        <Image
          source={{ uri: channel.avatar }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            marginRight: 10,
            backgroundColor: Colors.bgAlt,
          }}
        />

        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: FontWeight.semibold, color: Colors.textHeading }} className="font-sans">
            {channel.name}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }} className="font-sans">
            {channel.followers}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity onPress={handleToggleMute} style={{ padding: 8 }}>
            {notificationsMuted ? (
              <BellOff size={20} color={Colors.textPlaceholder} />
            ) : (
              <Bell size={20} color={Colors.textHeading} />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowDropdown(prev => !prev)} style={{ padding: 8 }}>
            <MoreHorizontal size={20} color={Colors.textHeading} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating Action Menu Dropdown Overlay */}
      {showDropdown && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            backgroundColor: Colors.white,
            borderRadius: 12,
            paddingVertical: 4,
            minWidth: 160,
            zIndex: 99,
            borderWidth: 1,
            borderColor: Colors.divider,
          }}
        >
          {isOwner ? (
            <TouchableOpacity
              onPress={() => { setShowDropdown(false); triggerToast(`Member management for ${channel.name} is coming soon`); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 13, color: Colors.textHeading, fontWeight: '500' }} className="font-sans">
                View Member List
              </Text>
              <ChevronLeft size={16} color={Colors.textHeading} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleUnfollow}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '500' }} className="font-sans">
                Unfollow channel
              </Text>
              <LogOut size={16} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Main Feed Content */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {channelPosts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onReact={handleReact}
            onOpenResponses={handleOpenResponses}
            onOpenImage={(images, index) => setViewer({ images, index })}
            onOpenLink={handleOpenLink}
          />
        ))}

        {channelPosts.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 13, color: Colors.textMuted }} className="font-sans">
              {isOwner ? 'No posts yet — share your first update below.' : 'No posts in this channel yet.'}
            </Text>
          </View>
        )}

        {/* Where the channel began, under its oldest post */}
        <View style={{ alignItems: 'center', marginVertical: 12 }}>
          {createdOn && (
            <View style={{ backgroundColor: Colors.primaryTransparent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '500' }} className="font-sans">
                {createdOn}
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 10 }} className="font-sans">
            The channel &quot;{channel.name}&quot; was created
          </Text>
        </View>
      </ScrollView>

      {/* Owner compose bar — WhatsApp-style: attachment menu, text, camera + voice note */}
      {isOwner && (
        <View style={{ backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.divider, paddingBottom: insets.bottom }}>
          {/* Attachment menu */}
          {attachMenuOpen && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'flex-start',
                rowGap: 14,
                paddingVertical: 16,
                paddingHorizontal: 8,
                borderBottomWidth: 1,
                borderBottomColor: Colors.divider,
              }}
            >
              {ATTACH_ITEMS.map(item => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => handleAttach(item.action)}
                  style={{ alignItems: 'center', gap: 6, width: '25%' }}
                  testID={`attach-${item.action}`}
                >
                  <View
                    style={{
                      width: 48, height: 48, borderRadius: 24,
                      backgroundColor: item.color,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <item.Icon size={22} color="#FFFFFF" />
                  </View>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }} className="font-sans">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* GOD-T89: what the post will carry — pictures (up to four), a video link and a link — each removable before sending */}
          {hasAttachments && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
              {draftImages.map((picture, index) => (
                <View key={`${picture.uri}-${index}`} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: Colors.bgAlt }}>
                  <Image source={{ uri: picture.uri }} style={{ width: '100%', height: '100%' }} />
                  <TouchableOpacity
                    onPress={() => setDraftImages(prev => prev.filter((_, i) => i !== index))}
                    style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                    accessibilityLabel={`Remove photo ${index + 1}`}
                  >
                    <X size={12} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {draftVideo && (
                <AttachmentChip Icon={Video} label={`Video · ${videoInfo(draftVideo).source}`} onEdit={() => openAddressSheet('video')} onRemove={() => setDraftVideo(null)} />
              )}
              {draftLink && (
                <AttachmentChip Icon={LinkIcon} label={draftLink.linkText || linkHost(draftLink.link)} onEdit={() => openAddressSheet('link')} onRemove={() => setDraftLink(null)} />
              )}
            </ScrollView>
          )}

          {/* Input row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TouchableOpacity onPress={() => setAttachMenuOpen(prev => !prev)} style={{ padding: 4 }} disabled={isPosting} accessibilityLabel="Add a photo, video, link or poll">
              {attachMenuOpen ? (
                <Keyboard size={24} color={Colors.textMuted} />
              ) : (
                <Plus size={24} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            <TextInput
              placeholder={hasAttachments ? 'Add a caption' : `Post an update to ${channel.name}`}
              placeholderTextColor={Colors.textPlaceholder}
              value={announceText}
              onChangeText={setAnnounceText}
              onFocus={() => setAttachMenuOpen(false)}
              editable={!isPosting}
              multiline
              maxLength={5000}
              style={{
                flex: 1,
                backgroundColor: Colors.bgScreen,
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 12,
                minHeight: 44,
                maxHeight: 120,
                fontSize: 13,
                color: Colors.textBody,
              }}
              className="font-sans"
            />

            {canSend || isPosting ? (
              <TouchableOpacity
                onPress={handleSendPost}
                disabled={isPosting}
                accessibilityLabel="Send post"
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: Colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isPosting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Send size={16} color={Colors.white} />
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={() => handlePickImage(true)} style={{ padding: 4 }} disabled={isPosting}>
                  <Camera size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleMicPress} style={{ padding: 4 }} disabled={isPosting}>
                  <Mic size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Blue notifications muted bottom banner Toast */}
      {toastMessage && (
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 24,
            alignSelf: 'center',
            backgroundColor: Colors.primary,
            borderRadius: 20,
            paddingVertical: 10,
            paddingHorizontal: 24,
            zIndex: 999,
          }}
        >
          <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '600' }} className="font-sans">
            {toastMessage}
          </Text>
        </View>
      )}

      {/* Full-screen picture viewer: swipe between a post's pictures */}
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
          {viewer && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: viewer.index * SCREEN_WIDTH, y: 0 }}
            >
              {viewer.images.map((uri, index) => (
                <View key={`${uri}-${index}`} style={{ width: SCREEN_WIDTH, justifyContent: 'center' }}>
                  <Image source={{ uri }} style={{ width: SCREEN_WIDTH, height: '80%' }} resizeMode="contain" />
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity
            onPress={() => setViewer(null)}
            accessibilityLabel="Close picture"
            style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Add a video link or a link to the post */}
      <Modal visible={addressSheet !== null} transparent animationType="slide" onRequestClose={() => setAddressSheet(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setAddressSheet(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Math.max(20, insets.bottom + 12), gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: FontWeight.semibold, color: Colors.textHeading }} className="font-sans">
              {addressSheet === 'video' ? 'Add a video' : 'Add a link'}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: -6 }} className="font-sans">
              {addressSheet === 'video'
                ? 'Paste a YouTube or Vimeo link, or a link to a video file.'
                : 'People can open it from the post.'}
            </Text>
            <TextInput
              value={addressInput}
              onChangeText={text => { setAddressInput(text); setAddressError(null); }}
              placeholder="https://"
              placeholderTextColor={Colors.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              style={{ borderWidth: 1, borderColor: addressError ? '#EF4444' : Colors.divider, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 14, color: Colors.textBody }}
              className="font-sans"
            />
            {addressSheet === 'link' && (
              <TextInput
                value={addressLabel}
                onChangeText={setAddressLabel}
                placeholder="Link text (optional), e.g. How to apply"
                placeholderTextColor={Colors.textPlaceholder}
                maxLength={120}
                style={{ borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 14, color: Colors.textBody }}
                className="font-sans"
              />
            )}
            {addressError && <Text style={{ fontSize: 12, color: '#EF4444' }} className="font-sans">{addressError}</Text>}
            <TouchableOpacity
              onPress={saveAddress}
              disabled={!addressInput.trim()}
              style={{ height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: addressInput.trim() ? Colors.primary : Colors.divider }}
            >
              <Text style={{ color: addressInput.trim() ? Colors.white : Colors.textPlaceholder, fontWeight: '700' }} className="font-sans">
                {addressSheet === 'video' ? 'Add video' : 'Add link'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Interactive Post Modal (Poll, Quiz, Question) */}
      <Modal
        visible={interactiveModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInteractiveModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: Colors.white,
              borderRadius: 20,
              padding: 20,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor:
                      interactiveKind === 'Poll' ? '#ECFDF5' : interactiveKind === 'Quiz' ? '#FEF3C7' : '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {interactiveKind === 'Poll' && <BarChart3 size={20} color="#10B981" />}
                  {interactiveKind === 'Quiz' && <ClipboardList size={20} color="#F59E0B" />}
                  {interactiveKind === 'Question' && <HelpCircle size={20} color="#3B82F6" />}
                </View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textHeading }} className="font-sans">
                  Create {interactiveKind}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setInteractiveModalOpen(false)}
                disabled={isPosting}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: Colors.bgScreen,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Optional Title / Topic */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 }} className="font-sans">
              Topic or Headline (optional)
            </Text>
            <TextInput
              placeholder={`e.g. Weekly ${interactiveKind}`}
              placeholderTextColor={Colors.textPlaceholder}
              value={interactiveTitle}
              onChangeText={setInteractiveTitle}
              editable={!isPosting}
              style={{
                backgroundColor: Colors.bgScreen,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 14,
                color: Colors.textHeading,
                marginBottom: 14,
              }}
              className="font-sans"
            />

            {/* Body / Content */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 }} className="font-sans">
              {interactiveKind === 'Poll'
                ? 'Poll Question & Options'
                : interactiveKind === 'Quiz'
                ? 'Quiz Prompt & Choices'
                : 'Question Details'}
            </Text>
            <TextInput
              placeholder={
                interactiveKind === 'Poll'
                  ? 'Ask a question and list options for members to respond...'
                  : interactiveKind === 'Quiz'
                  ? 'Enter the question, scenarios, and choices...'
                  : 'Ask a question for channel members to discuss...'
              }
              placeholderTextColor={Colors.textPlaceholder}
              value={interactiveBody}
              onChangeText={setInteractiveBody}
              multiline
              numberOfLines={4}
              editable={!isPosting}
              textAlignVertical="top"
              style={{
                backgroundColor: Colors.bgScreen,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 14,
                color: Colors.textHeading,
                minHeight: 100,
                marginBottom: 20,
              }}
              className="font-sans"
            />

            {/* Actions */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setInteractiveModalOpen(false)}
                disabled={isPosting}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: Colors.bgScreen,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.textMuted, fontWeight: '600' }} className="font-sans">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreateInteractivePost}
                disabled={!interactiveBody.trim() || isPosting}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  backgroundColor: interactiveBody.trim() && !isPosting ? Colors.primary : '#E5E7EB',
                }}
              >
                {isPosting && <ActivityIndicator size="small" color={Colors.white} />}
                <Text
                  style={{
                    fontSize: 14,
                    color: interactiveBody.trim() && !isPosting ? Colors.white : Colors.textPlaceholder,
                    fontWeight: '700',
                  }}
                  className="font-sans"
                >
                  {isPosting ? 'Posting...' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** A video or link waiting in the composer: tap to change it, or remove it. */
function AttachmentChip({ Icon, label, onEdit, onRemove }: { Icon: any; label: string; onEdit: () => void; onRemove: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 64, paddingLeft: 12, paddingRight: 6, borderRadius: 10, backgroundColor: Colors.primaryTransparent, maxWidth: 220 }}>
      <TouchableOpacity onPress={onEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        <Icon size={16} color={Colors.primary} />
        <Text numberOfLines={2} style={{ fontSize: 12, color: Colors.primary, fontWeight: '600', flexShrink: 1 }} className="font-sans">{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`} style={{ padding: 4 }}>
        <X size={14} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
