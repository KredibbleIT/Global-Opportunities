"use client";

/**
 * IntegrationsTab: Settings > Integrations (Desk Lead and Super Admin).
 *
 * Two cards: WordPress (the site address and an application password) and Google Analytics (the property ID and an API secret). The address
 * and the property ID are ordinary settings; the password and the secret are WRITE-ONLY (CredentialField): once saved they show as
 * "Saved · ends in ••••3f9a" with a Replace button and are never shown again. "Test connection" asks the server in real mode (a mock that succeeds after 800 ms in mock mode).
 * A note says what is true in the real app: "Credentials are stored on the server in the real app".
 */
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { CredentialField } from "@/components/settings/CredentialField";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/form/Field";
import { Input } from "@/components/ui/form/Input";
import { useToast } from "@/components/ui/Toast";
import { getIntegration, getIntegrationsVersion, saveIdentifier, subscribeIntegrations, type IntegrationKind } from "@/lib/services/settings";
import { isMockMode } from "@/lib/services/mock-mode";

interface CardSpec {
  kind: IntegrationKind;
  title: string;
  description: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  secretTitle: string;
  name: string;
}

const CARDS: CardSpec[] = [
  {
    kind: "wordpress",
    title: "WordPress",
    description: "Lets the desk publish to the website.",
    identifierLabel: "Site address",
    identifierPlaceholder: "https://www.example.org",
    secretTitle: "Application password",
    name: "WordPress",
  },
  {
    kind: "analytics",
    title: "Google Analytics",
    description: "Where the website audience numbers come from.",
    identifierLabel: "Property ID",
    identifierPlaceholder: "e.g. 123456789",
    secretTitle: "API secret",
    name: "Google Analytics",
  },
];

function IntegrationCard({ spec }: { spec: CardSpec }) {
  const toast = useToast();
  useSyncExternalStore(subscribeIntegrations, getIntegrationsVersion, getIntegrationsVersion);
  const saved = getIntegration(spec.kind);
  const [identifier, setIdentifier] = useState(saved.identifier);

  const saveSetting = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveIdentifier(spec.kind, identifier);
    } catch (error) {
      toast.error(`The ${spec.name} ${spec.identifierLabel.toLowerCase()} was not saved: ${error instanceof Error ? error.message : "Please try again."}`);
      return;
    }
    toast.success(`The ${spec.name} ${spec.identifierLabel.toLowerCase()} was saved.`);
  };

  return (
    <Card as="section" ariaLabel={spec.title}>
      <CardHeader title={spec.title} subtitle={spec.description} />
      <form onSubmit={saveSetting} noValidate className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <Field label={spec.identifierLabel} optional>
            <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={spec.identifierPlaceholder} autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={identifier.trim() === saved.identifier}>
          Save
        </Button>
      </form>
      <CredentialField kind={spec.kind} title={spec.secretTitle} name={spec.name} />
    </Card>
  );
}

export function IntegrationsTab() {
  return (
    <div className="max-w-240 space-y-4">
      {CARDS.map((spec) => (
        <IntegrationCard key={spec.kind} spec={spec} />
      ))}
      {/* GOD-T47: say what is true in THIS mode, and that app analytics have no integration yet (the review could not find one). */}
      <p data-testid="credentials-note" className="caption">
        {isMockMode()
          ? "Credentials are stored on the server in the real app. Here nothing is stored: only the last four characters are remembered, until you reload."
          : "Credentials are stored on the server, encrypted, and never shown again: only their last four characters appear here."}
      </p>
      <p data-testid="app-analytics-note" className="caption">
        App analytics: no integration is set up for the mobile app yet, so its views cannot be read automatically.
      </p>
    </div>
  );
}
