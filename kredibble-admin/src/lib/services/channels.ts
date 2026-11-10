/**
 * Channels service: saving the details an admin may edit on a channel (name, description, category, profile image).
 * Mock mode saves into the mock store, so the list and the detail page show the change at once. Real mode PATCHes the API (name,
 * description, category; the profile image is not sent yet because channel images cannot be uploaded: TODO(backend)).
 * Owner, platform, handle and followers are never written here: they are read-only.
 */
import { updateCommunityChannel } from "@/lib/api";
import { channels, type Channel } from "@/lib/mock-channels";
import { updateOverride } from "@/lib/mock-store";
import { isMockMode } from "@/lib/services/mock-mode";
import type { ChannelEditValues } from "@/components/community/EditChannelDialog";

export type SaveResult = { ok: true } | { ok: false; reason: string };

export async function saveChannelEdit(id: string, values: ChannelEditValues): Promise<SaveResult> {
  try {
    if (isMockMode()) {
      const base = channels.find((c) => c.id === id);
      if (!base) return { ok: false, reason: "This channel no longer exists." };
      // TODO(backend): persist this change.
      updateOverride<Channel>("channels", id, base, (previous) => ({ ...previous, name: values.name, bio: values.bio, category: values.category, avatar: values.avatar }));
    } else {
      await updateCommunityChannel(id, { name: values.name, bio: values.bio, category: values.category });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "The channel could not be saved. Try again." };
  }
}
