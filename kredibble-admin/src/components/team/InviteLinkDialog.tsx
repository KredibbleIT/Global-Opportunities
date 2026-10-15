"use client";

/**
 * InviteLinkDialog: shows the (mock) invite link ONCE, with a Copy button. There is no email service in this project yet, so the
 * super admin passes the link on; once this dialog is closed the link cannot be shown again (it is not stored). "Resend invite"
 * makes a new link and the old one stops working.
 * TODO(backend): the server creates the single-use token and emails the link; this dialog then goes away.
 *
 * Props: name (who the invite is for), link, expiresAt (ISO), onClose.
 */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { INVITE_HOURS } from "@/lib/accounts";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface InviteLinkDialogProps {
  name: string;
  link: string;
  expiresAt: string;
  onClose: () => void;
}

export function InviteLinkDialog({ name, link, expiresAt, onClose }: InviteLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link is selectable text below, so the person can copy it by hand.
      setCopied(false);
    }
  };

  return (
    <Dialog
      title="Invite link"
      description={`Send this link to ${name}. They use it to set their own password.`}
      onClose={onClose}
      size="md"
      testId="invite-link-dialog"
      footer={
        <>
          <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy} data-testid="invite-copy">
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button onClick={onClose} data-testid="invite-link-done">
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="body-sm">
          This link is shown <span className="font-semibold">once</span>. It expires in {INVITE_HOURS} hours ({WHEN.format(new Date(expiresAt))}) and can be used one time.
        </p>
        <p className="body-sm break-all rounded-control bg-surface-2 p-3 font-mono" data-testid="invite-link-text" tabIndex={0} aria-label="Invite link">
          {link}
        </p>
        <p className="caption" role="status" aria-live="polite">
          {copied ? "Link copied." : "Sample link: no email is sent from this screen yet (a backend job will send it)."}
        </p>
      </div>
    </Dialog>
  );
}
