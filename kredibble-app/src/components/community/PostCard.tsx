/**
 * GOD-T89: a community feed post — who posted it and when, its text, up to four pictures, a video and a link, then its reactions,
 * views and responses, and the React and Respond buttons.
 */
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Eye, FaceSlightlySmilingPlus, ExternalLink, Link as LinkIcon, MessageCircle, Pin, Play } from 'lucide-react-native';
import { Colors, FontWeight } from '../../constants/design';
import {
  POST_REACTIONS, compactCount, initials, linkHost, postAge, postImages, reactionTotal, responsesLabel, videoInfo, viewsLabel,
  type FeedPost,
} from '../../lib/post-engagement';

interface PostCardProps {
  post: FeedPost;
  /** The channel's picture, shown as the author's badge on posts the channel makes. */
  channelAvatar?: string;
  onReact: (post: FeedPost, emoji: string) => void;
  onOpenResponses: (post: FeedPost) => void;
  onOpenImage: (images: string[], index: number) => void;
  onOpenLink: (address: string) => void;
}

/** The card. Reactions update on screen straight away; the feed sends them to the server. */
export function PostCard({ post, channelAvatar, onReact, onOpenResponses, onOpenImage, onOpenLink }: PostCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const images = postImages(post);
  const totalReactions = reactionTotal(post);
  const age = postAge(post.createdAt);

  const pick = (emoji: string) => {
    setPickerOpen(false);
    onReact(post, emoji);
  };

  return (
    <View style={styles.card} testID={`post-${post.id}`}>
      {/* Who and when */}
      <View style={styles.header}>
        {channelAvatar ? (
          <Image source={{ uri: channelAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarInitials]}>
            <Text style={styles.avatarText}>{initials(post.authorName)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.author} className="font-sans">{post.authorName || 'Community member'}</Text>
          {!!age && <Text style={styles.meta} className="font-sans">{age}</Text>}
        </View>
        {!!post.pinnedAt && (
          <View style={styles.pinned}>
            <Pin size={11} color={Colors.primary} />
            <Text style={styles.pinnedText} className="font-sans">Pinned</Text>
          </View>
        )}
      </View>

      {!!post.title && <Text style={styles.title} className="font-sans">{post.title}</Text>}
      {!!post.body && <Text style={styles.body} className="font-sans">{post.body}</Text>}

      {images.length > 0 && <ImageGrid images={images} onOpen={(index) => onOpenImage(images, index)} />}

      {!!post.videoUrl && <VideoCard address={post.videoUrl} onOpen={() => onOpenLink(post.videoUrl!)} />}

      {!!post.link && (
        <TouchableOpacity activeOpacity={0.75} onPress={() => onOpenLink(post.link!)} style={styles.linkCard} accessibilityRole="link">
          <View style={styles.linkIcon}><LinkIcon size={16} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.linkTitle} className="font-sans">{post.linkText || linkHost(post.link)}</Text>
            <Text numberOfLines={1} style={styles.meta} className="font-sans">{linkHost(post.link)}</Text>
          </View>
          <ExternalLink size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Reactions, views and responses */}
      <View style={styles.stats}>
        {totalReactions > 0 ? (
          <View style={styles.reactionSummary} accessibilityLabel={`${totalReactions} reactions`}>
            <Text style={{ fontSize: 13 }}>{(post.reactions ?? []).slice(0, 3).map((reaction) => reaction.emoji).join('')}</Text>
            <Text style={styles.statText} className="font-sans">{compactCount(totalReactions)}</Text>
          </View>
        ) : <View />}
        <View style={styles.statsRight}>
          <Eye size={13} color={Colors.textMuted} />
          <Text style={styles.statText} className="font-sans">{viewsLabel(post.viewCount)}</Text>
          {(post.responseCount ?? 0) > 0 && (
            <TouchableOpacity onPress={() => onOpenResponses(post)} hitSlop={8}>
              <Text style={[styles.statText, styles.statLink]} className="font-sans">· {responsesLabel(post.responseCount)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {pickerOpen && (
        <View style={styles.picker} testID={`reaction-picker-${post.id}`}>
          {POST_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => pick(emoji)}
              style={[styles.pickerItem, post.myReaction === emoji && styles.pickerItemActive]}
              accessibilityLabel={`React with ${emoji}`}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* React and Respond */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => (post.myReaction ? onReact(post, post.myReaction) : setPickerOpen((open) => !open))}
          onLongPress={() => setPickerOpen(true)}
          accessibilityHint={post.myReaction ? 'Tap to take your reaction back, hold to change it' : undefined}
        >
          {post.myReaction ? <Text style={{ fontSize: 16 }}>{post.myReaction}</Text> : <FaceSlightlySmilingPlus size={18} color={Colors.textMuted} />}
          <Text style={[styles.actionText, !!post.myReaction && styles.actionTextActive]} className="font-sans">
            {post.myReaction ? 'Reacted' : 'React'}
          </Text>
        </TouchableOpacity>
        <View style={styles.actionDivider} />
        <TouchableOpacity style={styles.action} onPress={() => onOpenResponses(post)}>
          <MessageCircle size={18} color={post.hasRespondButton ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.actionText, post.hasRespondButton && styles.actionTextActive]} className="font-sans">Respond</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** One picture full width; two side by side; three as one large and two small; four as a square of four. */
function ImageGrid({ images, onOpen }: { images: string[]; onOpen: (index: number) => void }) {
  const tile = (index: number, style: object) => (
    <TouchableOpacity key={images[index]} activeOpacity={0.85} onPress={() => onOpen(index)} style={[styles.tile, style]} accessibilityLabel={`Picture ${index + 1} of ${images.length}`}>
      <Image source={{ uri: images[index] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </TouchableOpacity>
  );
  if (images.length === 1) return <View style={styles.grid}>{tile(0, { flex: 1, height: 210 })}</View>;
  if (images.length === 2) return <View style={styles.grid}>{tile(0, { flex: 1, height: 170 })}{tile(1, { flex: 1, height: 170 })}</View>;
  if (images.length === 3) {
    return (
      <View style={styles.grid}>
        {tile(0, { flex: 2, height: 220 })}
        <View style={{ flex: 1, gap: 4 }}>{tile(1, { flex: 1 })}{tile(2, { flex: 1 })}</View>
      </View>
    );
  }
  return (
    <View style={{ gap: 4, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>{tile(0, { flex: 1, height: 130 })}{tile(1, { flex: 1, height: 130 })}</View>
      <View style={{ flexDirection: 'row', gap: 4 }}>{tile(2, { flex: 1, height: 130 })}{tile(3, { flex: 1, height: 130 })}</View>
    </View>
  );
}

/** A video link: a still from the video when there is one, with a play button; tapping opens the video. */
function VideoCard({ address, onOpen }: { address: string; onOpen: () => void }) {
  const { source, thumbnail } = videoInfo(address);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpen} style={styles.video} accessibilityRole="link" accessibilityLabel={`Watch the video on ${source}`}>
      {thumbnail ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <View style={styles.videoShade} />
      <View style={styles.play}><Play size={22} color={Colors.white} fill={Colors.white} /></View>
      <Text style={styles.videoLabel} className="font-sans">Watch on {source}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider, paddingTop: 14, paddingHorizontal: 14, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgAlt },
  avatarInitials: { backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: FontWeight.semibold, color: Colors.primary },
  author: { fontSize: 14, fontWeight: FontWeight.semibold, color: Colors.textHeading },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryTransparent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pinnedText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold },
  title: { fontSize: 15, fontWeight: FontWeight.bold, color: Colors.textHeading, marginBottom: 4 },
  body: { fontSize: 14, color: Colors.textBody, lineHeight: 21 },
  grid: { flexDirection: 'row', gap: 4, marginTop: 12 },
  tile: { borderRadius: 10, overflow: 'hidden', backgroundColor: Colors.bgAlt },
  video: { marginTop: 12, height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1F1B2E', alignItems: 'center', justifyContent: 'center' },
  videoShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  videoLabel: { position: 'absolute', left: 12, bottom: 10, color: Colors.white, fontSize: 12, fontWeight: FontWeight.semibold },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: Colors.bgScreen, borderWidth: 1, borderColor: Colors.divider },
  linkIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 13, fontWeight: FontWeight.semibold, color: Colors.textHeading },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, minHeight: 18 },
  reactionSummary: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: Colors.textMuted },
  statLink: { color: Colors.primary },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'flex-start', gap: 2, marginTop: 10, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 28, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.divider },
  pickerItem: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pickerItemActive: { backgroundColor: Colors.primaryTransparent },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46 },
  actionDivider: { width: 1, height: 20, backgroundColor: Colors.divider },
  actionText: { fontSize: 13, color: Colors.textMuted, fontWeight: FontWeight.medium },
  actionTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
});
