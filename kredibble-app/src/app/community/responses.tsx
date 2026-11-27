import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Send, Trash } from 'lucide-react-native';
import { Colors, Radius } from '../../constants/design';
import { Header } from '../../components/ui/Header';
import { useToast } from '../../components/ui/ToastProvider';
import { authStore } from '../../constants/authStore';
import { useLeaveRemovedChannel } from '../../lib/useChannelRemoved';
import { createPostResponse, deletePostResponse, getPostResponses, type PostResponse } from '../../lib/api';
import { initials, postAge } from '../../lib/post-engagement';

/**
 * GOD-T89: a feed post's responses. Everyone in the group reads them, oldest first, and can add their own; the person who wrote a
 * response, or a group admin, can delete it.
 */
export default function PostResponsesScreen() {
  const params = useLocalSearchParams<{ channelId?: string; postId?: string; author?: string; excerpt?: string }>();
  const channelId = String(params.channelId || '');
  const postId = String(params.postId || '');
  useLeaveRemovedChannel(channelId);
  const { showToast } = useToast();
  const myId = authStore.user?.id;

  const [responses, setResponses] = useState<PostResponse[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const listRef = useRef<FlatList<PostResponse>>(null);

  useEffect(() => {
    if (!channelId || !postId) return;
    let cancelled = false;
    getPostResponses(channelId, postId)
      .then((result) => {
        if (cancelled) return;
        setResponses(result.responses);
        setCanManage(result.canManage);
      })
      .catch((err) => { if (!cancelled) setFailed(err instanceof Error ? err.message : 'Could not load the responses.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId, postId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const created = await createPostResponse(channelId, postId, body);
      setResponses((prev) => [...prev, created]);
      setDraft('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Your response could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = (response: PostResponse) => {
    Alert.alert('Delete this response?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePostResponse(channelId, postId, response.id);
            setResponses((prev) => prev.filter((row) => row.id !== response.id));
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'The response could not be deleted.', 'error');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top', 'left', 'right', 'bottom']}>
      <Header title="Responses" showBack />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bgScreen }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : failed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: Colors.textMuted, textAlign: 'center' }} className="font-sans">{failed}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={responses}
            keyExtractor={(row) => row.id}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            ListHeaderComponent={params.excerpt ? (
              <View style={{ backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderDefault, borderRadius: Radius.card, padding: 14, marginBottom: 16 }}>
                {!!params.author && <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 4 }} className="font-sans">{params.author}</Text>}
                <Text numberOfLines={4} style={{ fontSize: 14, lineHeight: 21, color: Colors.textBody }} className="font-sans">{params.excerpt}</Text>
              </View>
            ) : null}
            ListEmptyComponent={
              <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 24 }} className="font-sans">
                No responses yet. Be the first to respond.
              </Text>
            }
            renderItem={({ item }) => {
              const mine = Boolean(myId) && item.authorId === myId;
              return (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }} testID={`response-${item.id}`}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryTransparent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>{initials(item.authorName)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderDefault, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '600', color: Colors.textHeading }} className="font-sans">
                        {mine ? 'You' : item.authorName}
                      </Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted }} className="font-sans">{postAge(item.createdAt)}</Text>
                      {(mine || canManage) && (
                        <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={10} style={{ marginLeft: 'auto' }} accessibilityLabel="Delete response">
                          <Trash size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.textBody }} className="font-sans">{item.body}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {!failed && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderDefault }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a response"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
              style={{
                flex: 1, maxHeight: 110, minHeight: 48, borderRadius: Radius.control, borderWidth: 1, borderColor: Colors.borderInput,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.textBody, backgroundColor: Colors.bgCard,
              }}
            />
            <TouchableOpacity
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send response"
              style={{
                width: 48, height: 48, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center',
                backgroundColor: !draft.trim() || sending ? Colors.primary10 : Colors.primary,
              }}
            >
              {sending ? <ActivityIndicator color={Colors.primary} /> : <Send size={20} color={!draft.trim() ? Colors.primary : Colors.white} />}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
