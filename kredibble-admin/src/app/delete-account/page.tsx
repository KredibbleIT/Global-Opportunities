/**
 * Account deletion request page.
 *
 * Public page linked from the Google Play Store Data Safety section so users
 * can request that their account and associated data be deleted.
 *
 * Layout: centred card with the brand mark, clear steps, and a mailto action.
 * No authentication required — anyone can request deletion.
 */
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { BrandMark } from "@/components/BrandMark";

export const metadata = {
  title: `Delete my ${BRAND.sub} account`,
  description:
    "Request that your Global Opportunity Desk account and associated personal data be deleted.",
};

export default function DeleteAccountPage() {
  const supportEmail = "privacy@kredibble-desk.com";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12 bg-canvas text-ink">
      <div className="w-full max-w-2xl">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={56} className="mb-4" />
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Delete your {BRAND.sub} account
          </h1>
          <p className="mt-2 text-ink-muted">
            Request permanent deletion of your account and associated data.
          </p>
        </div>

        {/* Card */}
        <section className="card-surface p-8 rounded-xl border border-border">
          <h2 className="text-lg font-semibold mb-6">What happens when you request deletion</h2>

          <ol className="space-y-4 mb-8 text-sm text-ink-muted leading-relaxed">
            <li className="flex gap-3">
              <span className="flex shrink-0 items-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold justify-center items-center">
                1
              </span>
              <div>
                <p className="font-medium text-ink">Send us your request</p>
                <p className="text-xs mt-0.5">
                  Email <span className="font-mono">{supportEmail}</span> from the email address
                  registered to your account, with the subject line &quot;Delete my account&quot;.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex shrink-0 items-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold justify-center items-center">
                2
              </span>
              <div>
                <p className="font-medium text-ink">We verify your identity</p>
                <p className="text-xs mt-0.5">
                  We may reply to confirm the email address matches your registered account before
                  proceeding.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex shrink-0 items-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold justify-center items-center">
                3
              </span>
              <div>
                <p className="font-medium text-ink">Your data is deleted</p>
                <p className="text-xs mt-0.5">
                  Your account, profile, applications, saved listings and bio are permanently removed.
                </p>
              </div>
            </li>
          </ol>

          <div className="mb-8 rounded-lg bg-amber-50 p-6 border border-amber-100">
            <h3 className="font-semibold text-amber-900 mb-2">Data that is deleted</h3>
            <ul className="text-sm text-ink-muted space-y-2 list-disc pl-5">
              <li>Account profile (name, email, phone number)</li>
              <li>Profile photo and bio</li>
              <li>Job/internship/scholarship applications you submitted</li>
              <li>Saved (bookmarked) listings</li>
              <li>Push notification preferences and device tokens</li>
            </ul>

            <h3 className="font-semibold text-amber-900 mt-6 mb-2">Data we may retain</h3>
            <ul className="text-sm text-ink-muted space-y-2 list-disc pl-5">
              <li>
                Anonymised analytics data that cannot be traced back to you
              </li>
              <li>Records required for legal, tax or fraud-prevention obligations</li>
            </ul>

            <p className="mt-4 text-sm text-ink-muted">
              Retention period: backup copies may be retained for up to <strong>30 days</strong> before
              permanent removal from all systems.
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
            <a
              href={`mailto:${supportEmail}?subject=Delete%20my%20account&body=Hi%20%2C%20I%20would%20like%20to%20request%20the%20permanent%20deletion%20of%20my%20account%20and%20all%20associated%20data.%20My%20registered%20email%20address%20is%3A%20`}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-control bg-orange-600 text-white h-10 px-4 font-semibold transition-colors hover:bg-orange-hover disabled:bg-neutral-soft disabled:text-muted"
            >
              Request account deletion
            </a>
            <Link href="/" className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-control bg-surface text-ink border border-line-strong h-10 px-4 font-semibold transition-colors hover:bg-surface-2">
              Return to dashboard
            </Link>
          </div>
        </section>

        <p className="mt-8 text-xs text-ink-muted text-center">
          Global Opportunity Desk &bull; Account deletion request
        </p>
      </div>
    </main>
  );
}
