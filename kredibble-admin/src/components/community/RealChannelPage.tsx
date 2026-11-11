"use client";

/**
 * RealChannelPage: one live channel, for the admin. Built on the shared detail template.
 *
 * Tabs: Group chat (history + composer, see ChannelChat) and Members (see ChannelMembers).
 * Data: GET /admin/community/channels/:id (real API). Moderation of feed posts stays on the Reports queue.
 */
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { getCommunityChannelById, type ChannelRecord } from "@/lib/api";
import { useBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { formatDate, formatFollowers } from "@/lib/format";
import { saveChannelEdit } from "@/lib/services/channels";
import { useRoles } from "@/components/access/RoleProvider";
import { EditChannelDialog } from "@/components/community/EditChannelDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDetailData } from "@/lib/use-detail-data";
import { ChannelChat } from "@/components/community/ChannelChat";
import { ChannelMembers } from "@/components/community/ChannelMembers";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { DetailError, DetailNotFound, DetailSkeleton } from "@/components/detail/DetailStates";
import { InfoCard } from "@/components/detail/InfoCard";
import { KeyValueList } from "@/components/ui/KeyValueList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, tabId, tabPanelId } from "@/components/ui/Tabs";

type TabValue = "chat" | "members";
const ID_PREFIX = "channel";

export function RealChannelPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => getCommunityChannelById(id).catch((err: { status?: number }) => (err?.status === 404 ? undefined : Promise.reject(err))), [id]);
  const { status, record: channel, error, retry } = useDetailData<ChannelRecord>(load);
  const [tab, setTab] = useState<TabValue>("chat");
  const [editing, setEditing] = useState(false);
  const { can } = useRoles();
  const toast = useToast();

  useBreadcrumbLabel(status === "loading" ? undefined : channel ? channel.name : "Not found");

  if (status === "loading") return <DetailSkeleton />;
  if (status === "error") return <DetailError message={error ?? "Could not load this channel."} onRetry={retry} />;
  if (!channel) return <DetailNotFound noun="Channel" listLabel="Community channels" listHref="/community" />;

  const isPrivate = channel.visibility === "private";

  return (
    <div className="space-y-4">
      <DetailHeader
        leading={{ name: channel.name, imageSrc: channel.avatar }}
        title={channel.name}
        badges={<StatusBadge status={channel.status} />}
        // Visibility and category are shown once, in the Details card (not repeated here).
        actions={
          can("channels", "edit") && (
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)} data-testid="edit-channel-open">
              Edit channel
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InfoCard title="Channel">
            <Tabs
              ariaLabel="Channel sections"
              idPrefix={ID_PREFIX}
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "chat", label: "Group chat" },
                { value: "members", label: "Members" },
              ]}
            />
            <div role="tabpanel" id={tabPanelId(ID_PREFIX, tab)} aria-labelledby={tabId(ID_PREFIX, tab)} className="pt-4">
              {tab === "chat" ? <ChannelChat channelId={channel.id} /> : <ChannelMembers channelId={channel.id} creatorId={channel.createdBy} />}
            </div>
          </InfoCard>
        </div>
        <div className="order-first lg:order-none lg:col-span-1">
          <InfoCard title="Details">
            <KeyValueList
              items={[
                { label: "Visibility", value: isPrivate ? "Private (invite only)" : "Public" },
                { label: "Category", value: channel.category },
                { label: "Description", value: channel.bio },
                { label: "Owner", value: channel.owner },
                { label: "Followers", value: formatFollowers(channel.followers) },
                { label: "Created", value: formatDate(channel.createdAt) },
              ]}
            />
          </InfoCard>
        </div>
      </div>
      {editing && (
        <EditChannelDialog
          channel={channel}
          categories={[]}
          allowImage={false}
          onClose={() => setEditing(false)}
          onSave={async (values) => {
            const result = await saveChannelEdit(channel.id, values);
            if (result.ok) {
              toast.success(`${values.name} was updated.`);
              setEditing(false);
              retry();
            }
            return result;
          }}
        />
      )}
    </div>
  );
}
