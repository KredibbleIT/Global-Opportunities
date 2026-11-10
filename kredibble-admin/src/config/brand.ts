/**
 * Brand identity: the single place to rename the product.
 * The sidebar, login title, document title and footer all read from here.
 */
export const BRAND = {
  name: "G.O.D",
  sub: "Global Opportunity Desk",
} as const;

/**
 * Domain used for MOCK staff email addresses. ".example" is reserved for documentation, so no mock
 * address can ever reach a real inbox. Real product names (the app is still "kredibble-app") stay as they are.
 */
export const BRAND_EMAIL_DOMAIN = "god.example";

/** "G.O.D Admin": used for the login heading and the browser tab title. */
export const BRAND_ADMIN_TITLE = `${BRAND.name} Admin`;

/**
 * Footer links (GOD-T20). Terms and Privacy are the Desk's published pages, the same ones the mobile app opens
 * (kredibble-app/src/lib/legal.ts). There is no Help page yet: Help is shown only when NEXT_PUBLIC_HELP_URL is set, so the
 * footer never carries a link that goes nowhere (the review found all three pointing at "#").
 */
export const TERMS_URL = "https://globalopportunitydesk.com/terms-of-service/";
export const PRIVACY_URL = "https://globalopportunitydesk.com/privacy-policy/";

export interface FooterLink {
  label: string;
  href: string;
}

/** The footer's links: Help (when configured), Terms and Privacy. `NEXT_PUBLIC_*` is written literally so Next can inline it. */
export const footerLinks = (helpUrl: string | undefined = process.env.NEXT_PUBLIC_HELP_URL): FooterLink[] => [
  ...(helpUrl && /^(https:\/\/|mailto:)/.test(helpUrl) ? [{ label: "Help", href: helpUrl }] : []),
  { label: "Terms", href: TERMS_URL },
  { label: "Privacy", href: PRIVACY_URL },
];
