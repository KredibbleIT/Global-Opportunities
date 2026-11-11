"use client";

/**
 * Admin sign-in.
 *
 * Layout
 * - 1024px and up: split screen. Left, the purple-and-orange panel: the logo top left directly on the purple, the person cutout
 *   (public/brand/signin-photo.png, SignInFigure) filling the lower part, and the headline and subtext at the bottom left on a soft dark
 *   scrim (clear of her face). Without the png the panel just has no figure. Phones do not draw this panel. Right, the form card.
 * - Below 1024px: the form comes first, with the logo above it (still visible); the photo panel is not drawn.
 * Logo: public/brand/god-logo.png (see BrandLogo; a text wordmark shows until the file exists).
 *
 * Behaviour (unchanged): POST /auth/admin/login through loginAdmin() (src/lib/api.ts), which also checks the
 * admin role and throws the server's message for every error path (wrong credentials, non-admin role, rate
 * limit, lockout, network). The message is shown in the banner below.
 * Added: show/hide password button, a spinner on Sign in while the request runs, an error banner that is
 * announced (role="alert"), and focus on the email field when the page opens.
 * There is no signup: access is by invitation only.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SignInFigure } from "@/components/SignInFigure";
import { loginAdmin } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/form/Field";
import { Input } from "@/components/ui/form/Input";
import { PasswordInput } from "@/components/ui/form/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = email.trim().length > 0 && password.trim().length > 0 && !isSubmitting;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setError("");
    setIsSubmitting(true);
    try {
      await loginAdmin(email.trim(), password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 lg:grid lg:grid-cols-2">
      {/* Brand panel: 1024px and up only */}
      <aside className="signin-panel dark-surface relative hidden flex-col justify-between overflow-hidden lg:flex">
        {/* The logo directly on the purple, top left, natural aspect ratio (about 250px wide, height auto). */}
        <div className="relative z-20 self-start px-10 pt-10">
          <BrandLogo className="max-w-62" />
        </div>
        {/* Decorative cutout: about 60% of the panel height (head top near 45% down, as in the reference), bottom-anchored, face at about 67% of the panel width (bottom right), cropped by the panel edge. */}
        <SignInFigure
          className="absolute bottom-0 h-[60%]"
          // Her face (0.535 of the figure's width; the figure is 60% of the panel height x 1.32 wide, and the panel is one screen tall)
          // sits at 67% of the panel width: bottom RIGHT, her right shoulder cropped by the panel edge. Data-driven, so inline.
          style={{ left: "calc(67% - 42.4vh)" }}
        />
        {/* The text sits at the bottom left, over the lower part of the figure, on a soft dark scrim (not over her face). */}
        <div className="signin-scrim relative z-10 px-10 pb-10 pt-16">
          <div className="max-w-md">
            <p className="hero-title text-sb-text">Keep every opportunity on the platform trusted.</p>
            <p className="body-sm mt-4 text-sb-muted">Review verifications, moderate postings and look after your community from one desk.</p>
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            {/* Below 1024px the left panel is gone, so the logo sits above the form. */}
            <BrandLogo className="mb-6 lg:hidden" />
            <h1 data-testid="page-title" className="page-title">Admin Portal</h1>
          </div>

          <form onSubmit={handleLogin} noValidate className="card-surface space-y-4 p-6">
            <Field label="Email">
              <Input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </Field>

            <Field label="Password">
              <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" />
            </Field>

            {error && (
              <p role="alert" className="body-sm flex items-start gap-2 rounded-control border border-danger/25 bg-danger-soft px-3 py-2 text-danger">
                <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <Button type="submit" loading={isSubmitting} disabled={!isValid} className="w-full">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>

            <p className="caption flex items-center justify-center gap-1.5 text-center">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
              Access is by invitation only.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
