import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import { pickCameraImage, pickImage } from '../../lib/file-picker';
import { updateMyAvatar, uploadFile } from '../../lib/api';
import { useToast } from './ToastProvider';

interface ProfilePictureProps {
  name?: string;
  avatarUrl?: string | null;
  /** Called with the new picture address (or null when removed) once the server has saved it. */
  onChanged: (avatarUrl: string | null) => void;
  /** Size and shape of the picture (width, height, borderRadius, margins). */
  style?: StyleProp<ViewStyle>;
}

const initialsOf = (name?: string) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';

/**
 * The signed-in person's profile picture. Tap it to choose a photo, take one, or remove the current one.
 * A picture is uploaded first, then saved on the profile; the server deletes the one it replaces.
 */
export function ProfilePicture({ name, avatarUrl, onChanged, style }: ProfilePictureProps) {
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<string | null | undefined>, done: string) => {
    setSheetOpen(false);
    setBusy(true);
    try {
      const result = await task();
      if (result === undefined) return; // cancelled
      onChanged(result);
      showToast(done, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update your picture. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const choose = (camera: boolean) =>
    run(async () => {
      const picked = await (camera ? pickCameraImage() : pickImage());
      if (!picked) return undefined;
      const uploaded = await uploadFile({ uri: picked.uri, name: picked.name, mimeType: picked.mimeType }, 'avatars');
      return updateMyAvatar(uploaded.url);
    }, 'Profile picture updated');

  const remove = () => run(() => updateMyAvatar(null), 'Profile picture removed');

  const flat = StyleSheet.flatten([styles.frame, style]) as ViewStyle;
  const size = typeof flat.width === 'number' ? flat.width : 100;

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Change profile picture"
        activeOpacity={0.85}
        onPress={() => setSheetOpen(true)}
        disabled={busy}
        style={flat}
        testID="profile-picture"
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={[StyleSheet.absoluteFill, { borderRadius: flat.borderRadius }]} />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.34 }]} className="font-sans">{initialsOf(name)}</Text>
        )}
        <View style={styles.badge}>
          <Camera size={14} color="#FFFFFF" />
        </View>
        {busy && (
          <View style={[styles.busy, { borderRadius: flat.borderRadius }]}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.title} className="font-sans">Profile picture</Text>
            <Option icon={<ImageIcon size={20} color="#111827" />} label="Choose from library" onPress={() => choose(false)} />
            <Option icon={<Camera size={20} color="#111827" />} label="Take a photo" onPress={() => choose(true)} />
            {avatarUrl ? <Option icon={<Trash2 size={20} color="#DC2626" />} label="Remove picture" danger onPress={remove} /> : null}
            <TouchableOpacity onPress={() => setSheetOpen(false)} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText} className="font-sans">Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.option} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <Text style={[styles.optionText, danger && { color: '#DC2626' }]} className="font-sans">{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  frame: { width: 100, height: 100, borderRadius: 24, backgroundColor: '#EBEBEE', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#4B5563', fontWeight: '700' },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  optionText: { fontSize: 16, color: '#111827' },
  cancel: { marginTop: 8, paddingVertical: 14, alignItems: 'center', borderRadius: 14, backgroundColor: '#F3F4F6' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#111827' },
});
