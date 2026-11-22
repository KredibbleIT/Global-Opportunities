import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { useRouter } from 'expo-router';
import { useToast } from '../components/ui/ToastProvider';
import { socketService } from './socket';

/**
 * Calls `onRemoved(channelId)` the moment an admin deletes a channel, over the live connection (the server sends `channel_removed` with the id to every
 * signed-in app). It works for as long as the screen is mounted; a person who was offline at the time gets the same result when the list next loads.
 */
export function useChannelRemoved(onRemoved: (channelId: string) => void) {
  const latest = useRef(onRemoved);
  useEffect(() => {
    latest.current = onRemoved;
  });

  useEffect(() => {
    let cancelled = false;
    let attached: Socket | null = null;
    const listener = (payload: { channelId?: string }) => {
      if (payload?.channelId) latest.current(String(payload.channelId));
    };
    socketService
      .connect()
      .then(() => {
        if (cancelled || !socketService.socket) return;
        attached = socketService.socket;
        attached.on('channel_removed', listener);
      })
      .catch(() => {
        // Realtime is an enhancement: the list still reloads whenever the tab comes into view.
      });
    return () => {
      cancelled = true;
      attached?.off('channel_removed', listener);
    };
  }, []);
}

/** For a screen inside one channel (its posts, a thread): when that channel is deleted, say so and go back to the Community list. */
export function useLeaveRemovedChannel(channelId: string) {
  const router = useRouter();
  const { showToast } = useToast();
  useChannelRemoved((removedId) => {
    if (!channelId || removedId !== channelId) return;
    showToast('This channel was removed.', 'info');
    router.replace('/(tabs)/community' as never);
  });
}
