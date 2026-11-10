"use client";

/**
 * LogPostDialog: the "Add post" dialog on /social. It holds the whole "Log a post" form (LogPostCard, drawn without its card frame),
 * so the page itself is just the compact Monthly totals and the posts list. It closes after a post is saved.
 *
 * Props: onClose, onLogged?(post): called after a save (the page follows the post's month if it is another month)
 */
import { Dialog } from "@/components/ui/Dialog";
import type { SocialPost } from "@/lib/mock-entities";
import { LogPostCard } from "./LogPostCard";

export function LogPostDialog({ onClose, onLogged }: { onClose: () => void; onLogged?: (post: SocialPost) => void }) {
  return (
    <Dialog title="Add post" description="Log a post you published. It counts in the month of its date." onClose={onClose} size="md" testId="log-post-dialog">
      <LogPostCard
        plain
        onLogged={(post) => {
          onLogged?.(post);
          onClose();
        }}
      />
    </Dialog>
  );
}
