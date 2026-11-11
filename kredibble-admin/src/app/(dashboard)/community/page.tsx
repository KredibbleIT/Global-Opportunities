"use client";

/**
 * Community channels: every channel across the platform.
 * Built on the shared list template; this file holds the column config and the data.
 * Data: the real API (GET /admin/community/channels). In mock mode (NEXT_PUBLIC_USE_MOCKS=true) the sample channels in
 * src/lib/mock-channels.ts are shown instead.
 *
 * "Create channel" opens a small form (name, category, description, private or public). Private, invite-only channels are
 * how the Ambassadors group is made. Each row opens the channel: members and group chat.
 *
 * A flagged channel's status badge shows a flag ICON with the text "Flagged". Emoji in stored channel
 * names (e.g. a siren) are removed from the title so the marker is never an emoji.
 */
import { useCallback, useState } from "react";
import { Flag, Hash, Pencil, Plus } from "lucide-react";
import { getCommunityChannels } from "@/lib/api";
import { formatFollowers, stripEmoji } from "@/lib/format";
import { channels, type Channel } from "@/lib/mock-channels";
import { overlayRows, subscribeMockStore } from "@/lib/mock-store";
import { saveChannelEdit } from "@/lib/services/channels";
import { isMockMode } from "@/lib/services/mock-mode";
import { useToast } from "@/components/ui/Toast";
import { useRoles } from "@/components/access/RoleProvider";
import { Kebab } from "@/components/ui/Kebab";
import { EditChannelDialog } from "@/components/community/EditChannelDialog";
import { useListData } from "@/lib/use-list-data";
import { CreateChannelDialog } from "@/components/community/CreateChannelDialog";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import type { Column } from "@/components/list/types";
import { Button } from "@/components/ui/Button";

const loadChannels = async (): Promise<Channel[]> => {
  if (isMockMode()) return overlayRows("channels", channels);
  const page = await getCommunityChannels({ limit: 100 });
  return page.data.map((c) => ({
    id: c.id,
    name: c.name,
    owner: c.visibility === "private" ? `${c.owner ?? "Admin"} (private)` : c.owner ?? "Public",
    bio: c.bio,
    avatar: c.avatar,
    category: c.category,
    followers: c.followers ?? "",
    postsCount: c.postsCount ?? 0,
    status: c.status === "removed" || c.status === "flagged" ? c.status : "active",
    posts: [],
  }));
};

/** The columns. `edit` (when the viewer may edit channels) adds the row menu with "Edit channel". */
const columns = (edit?: (row: Channel) => void): Column<Channel>[] => [
  // The profile image when the channel has one, otherwise an initials avatar in the brand colours.
  { key: "channel", header: "Channel", type: "primary", width: "30%", title: (r) => stripEmoji(r.name), leading: (r) => ({ avatarName: stripEmoji(r.name), imageSrc: r.avatar }) },
  { key: "owner", header: "Owner", type: "text", width: "20%", value: (r) => r.owner },
  // A measured 0 when the source says zero, "Unavailable" when it has no figure (never a blank cell).
  { key: "followers", header: "Followers", type: "text", width: "14%", value: (r) => formatFollowers(r.followers) },
  { key: "posts", header: "Posts", type: "number", width: "10%", value: (r) => r.postsCount },
  { key: "status", header: "Status", type: "status", width: "18%", status: (r) => r.status, icon: (r) => (r.status === "flagged" ? Flag : undefined) },
  ...(edit
    ? [
        {
          key: "actions",
          header: "Actions",
          type: "custom" as const,
          width: "8%",
          render: (r: Channel) => (
            <div className="relative z-10 flex justify-end focus-within:z-20 max-sm:justify-start">
              <span className="sr-only" aria-hidden="true">
                Channel actions
              </span>
              <Kebab label={`Channel actions for ${stripEmoji(r.name)}`} items={[{ label: "Edit channel", icon: Pencil, onSelect: () => edit(r) }]} />
            </div>
          ),
        },
      ]
    : []),
];

export default function CommunityChannelsPage() {
  const { rows, isLoading, error, retry } = useListData(loadChannels, { subscribe: subscribeMockStore });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const toast = useToast();
  const { can } = useRoles();
  const canEdit = can("channels", "edit");
  const closeDialog = useCallback(() => setCreating(false), []);
  const flaggedCount = (rows ?? []).filter((c) => c.status === "flagged").length;

  return (
    <>
      <ListPage
        title="Community channels"
        subtitle={rows ? `All channels across the platform. ${flaggedCount} flagged for review.` : "All channels across the platform."}
        actions={
          !isMockMode() && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Create channel
            </Button>
          )
        }
      >
        <DataTable
          label="Channels"
          columns={columns(canEdit ? setEditing : undefined)}
          rows={rows ?? []}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/community/${r.id}`}
          loading={isLoading}
          error={error}
          onRetry={retry}
          emptyNoData={{ icon: Hash, title: "No channels yet", description: "Create one, for example a private group for your ambassadors.", action: !isMockMode() ? <Button icon={Plus} onClick={() => setCreating(true)}>Create your first channel</Button> : undefined }}
          emptyNoResults={{ icon: Hash, title: "No channels match" }}
        />
      </ListPage>
      <CreateChannelDialog open={creating} onClose={closeDialog} onCreated={retry} />
      {editing && (
        <EditChannelDialog
          channel={editing}
          categories={(rows ?? []).map((c) => c.category)}
          allowImage={isMockMode()}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const result = await saveChannelEdit(editing.id, values);
            if (result.ok) {
              // Mock mode: the store already changed and the list re-reads it. Real mode: reload the list from the API.
              if (!isMockMode()) retry();
              toast.success(`${values.name} was updated.`);
              setEditing(null);
            }
            return result;
          }}
        />
      )}
    </>
  );
}
