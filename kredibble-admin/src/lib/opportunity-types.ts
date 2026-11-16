/**
 * Labels and icons for opportunity types, shared by the Opportunities queue and the review page.
 *
 * The redesign's four types (jobs, internships, events, grants), the API's other posting types and the desk's curated
 * scholarships, so a posting
 * is never shown as a type it isn't. A type nobody has listed here shows its own name.
 */
import { Award, Briefcase, CalendarDays, Compass, GraduationCap, Globe, HandCoins, HeartHandshake, Medal, Presentation, Trophy, type LucideIcon } from "lucide-react";
import type { ListingType } from "@/lib/mock-entities";

export interface OpportunityTypeMeta {
  label: string;
  icon: LucideIcon;
}

const TYPE_META: Record<string, OpportunityTypeMeta> = {
  jobs: { label: "Job", icon: Briefcase },
  internships: { label: "Internship", icon: GraduationCap },
  events: { label: "Event", icon: CalendarDays },
  grants: { label: "Grant", icon: HandCoins },
  competitions: { label: "Competition", icon: Trophy },
  fellowships: { label: "Fellowship", icon: Award },
  scholarships: { label: "Scholarship", icon: Medal },
  trainings: { label: "Training", icon: Presentation },
  volunteers: { label: "Volunteering", icon: HeartHandshake },
  mentorships: { label: "Mentorship", icon: Compass },
  volunteer: { label: "Volunteering", icon: HeartHandshake },
  mentorship: { label: "Mentorship", icon: Compass },
};

/** The label and icon for a type key ("jobs", "competitions", ...). */
export const opportunityTypeMeta = (type: string): OpportunityTypeMeta => TYPE_META[type] ?? { label: type, icon: Briefcase };

/**
 * The eight opportunity categories: the tabs of the Opportunities queue and the "Opportunity type" of a new listing. The same list as the app's
 * Opportunities screen and the API's counts (kredibble-backend/src/lib/opportunity-categories.js): keep the three in step.
 *
 * - `key`: the category.
 * - `typeKeys`: the queue's type keys that belong to it (singular and plural spellings). Competitions are part of Events & Competitions and
 *   internships of Jobs & Internships.
 * - `listingType`: the type a new listing of this category is saved with.
 */
export interface OpportunityCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  typeKeys: string[];
  listingType: ListingType;
}

export const OPPORTUNITY_CATEGORIES: OpportunityCategory[] = [
  { key: "events", label: "Events & Competitions", icon: CalendarDays, typeKeys: ["events", "event", "competitions", "competition"], listingType: "event" },
  { key: "volunteer", label: "Volunteerism & Community Service", icon: HeartHandshake, typeKeys: ["volunteers", "volunteer"], listingType: "volunteer" },
  { key: "funding", label: "Awards, Grants & Funding", icon: HandCoins, typeKeys: ["grants", "grant"], listingType: "grant" },
  { key: "jobs", label: "Jobs & Internships", icon: Briefcase, typeKeys: ["jobs", "job", "internships", "internship"], listingType: "job" },
  { key: "scholarships", label: "Scholarships", icon: Medal, typeKeys: ["scholarships", "scholarship"], listingType: "scholarship" },
  { key: "fellowships", label: "Fellowships & Exchange Programmes", icon: Globe, typeKeys: ["fellowships", "fellowship"], listingType: "fellowship" },
  { key: "training", label: "Training & Workshops", icon: Presentation, typeKeys: ["trainings", "training", "training-workshop"], listingType: "training" },
  { key: "mentorship", label: "Mentorship & Career Development", icon: Compass, typeKeys: ["mentorships", "mentorship"], listingType: "mentorship" },
];

/** The category a type key belongs to, or undefined for a type that is in none. */
export const categoryOfTypeKey = (typeKey: string): OpportunityCategory | undefined => OPPORTUNITY_CATEGORIES.find((category) => category.typeKeys.includes(typeKey));

/** How a listing is paid for. The API's values; the app shows the same labels. */
export const FUNDING_LABELS: Record<string, string> = {
  free: "Free",
  paid: "Paid",
  "fully-funded": "Fully funded",
  "partially-funded": "Partially funded",
  stipend: "Stipend",
  unfunded: "Unfunded",
};

/**
 * What the "Category details" of the listing form asks for, by listing type. A type that is not here (a job, an event, a grant) shows only
 * "Who can apply" and "What it offers". The app's category cards and filters read the same fields.
 */
export interface CategoryDetails {
  focusLabel: string;
  focusOptions: string[];
  levelLabel?: string;
  levelOptions?: string[];
  fundingLabel?: string;
  fundingOptions?: string[];
  certificateLabel?: string;
}

const FIELDS_OF_STUDY = ["Agriculture", "Arts and humanities", "Business and economics", "Education", "Engineering and technology", "Environment", "Health and medicine", "Law and policy", "Science", "Social sciences", "Any field"];

export const CATEGORY_DETAILS: Partial<Record<ListingType, CategoryDetails>> = {
  volunteer: {
    focusLabel: "Cause area",
    focusOptions: ["Animals and nature", "Arts and culture", "Community development", "Disaster relief", "Education and literacy", "Environment", "Health", "Technology", "Women and girls", "Youth"],
    certificateLabel: "Certificate or training provided",
  },
  scholarship: {
    focusLabel: "Field of study",
    focusOptions: FIELDS_OF_STUDY,
    levelLabel: "Study level",
    levelOptions: ["Undergraduate", "Master's", "PhD", "Postdoctoral", "Short course"],
    fundingLabel: "Funding",
    fundingOptions: ["fully-funded", "partially-funded"],
  },
  fellowship: {
    focusLabel: "Field",
    focusOptions: FIELDS_OF_STUDY,
    levelLabel: "Career stage",
    levelOptions: ["Student", "Early-career", "Mid-career", "Senior"],
    fundingLabel: "Funding",
    fundingOptions: ["fully-funded", "stipend", "partially-funded", "unfunded"],
  },
  training: {
    focusLabel: "Topic",
    focusOptions: ["Business and entrepreneurship", "Career skills", "Data and AI", "Design", "Finance", "Health", "Languages", "Leadership", "Software and IT", "Writing and media"],
    levelLabel: "Level",
    levelOptions: ["Beginner", "Intermediate", "Advanced"],
    fundingLabel: "Cost",
    fundingOptions: ["free", "paid"],
    certificateLabel: "Certificate offered",
  },
  mentorship: {
    focusLabel: "Expertise",
    focusOptions: ["Business and entrepreneurship", "Career growth", "Data and AI", "Design", "Finance", "Leadership", "Software and IT", "Study abroad", "Writing and media"],
    fundingLabel: "Cost",
    fundingOptions: ["free", "paid"],
  },
};
