/**
 * GOD-T101: "Who can apply" and "What it offers" are part of a listing's Description now, not boxes of their own.
 *
 * Dorcas asked (18 Nov 2026) to merge them under the description. The listing form no longer has the two boxes; a listing that
 * still has text in them gets it moved into its Description, under the same headings, when it is opened for editing, so nothing is
 * lost. Saving then clears the old fields, so the app shows the text once (inside About) instead of twice.
 */
import { hasRichMarks } from "./rich-text";

/** The headings the moved text goes under: the same words the app used for the two sections. */
export const ELIGIBILITY_HEADING = "Who can apply";
export const BENEFITS_HEADING = "What it offers";

/**
 * One old field as a Description section. Text that already uses formatting is kept as written; plain text ("one point on each
 * line", as the old box asked) becomes a bullet list, which is how the app showed it.
 */
function section(heading: string, text: string | undefined): string {
  const body = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) return "";
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const content = hasRichMarks(body)
    ? body
    : lines.length === 1
      ? lines[0]
      : lines.map((line) => `- ${line.replace(/^[-*•]\s+/, "")}`).join("\n");
  return `## ${heading}\n${content}`;
}

/**
 * The Description with the old "Who can apply" and "What it offers" text added at the end under their headings. When neither has
 * text, the Description is returned unchanged.
 */
export function foldDetailsIntoDescription(description: string, eligibility?: string, benefits?: string): string {
  const parts = [section(ELIGIBILITY_HEADING, eligibility), section(BENEFITS_HEADING, benefits)].filter(Boolean);
  if (parts.length === 0) return description;
  return [description.trimEnd(), ...parts].filter(Boolean).join("\n\n");
}

/** True when a listing still has text in either old box (so the form tells staff it was moved). */
export const hasSeparateDetails = (eligibility?: string, benefits?: string): boolean =>
  Boolean(String(eligibility ?? "").trim() || String(benefits ?? "").trim());
