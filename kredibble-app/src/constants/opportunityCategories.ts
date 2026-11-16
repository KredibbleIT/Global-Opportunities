import type { ImageSourcePropType } from 'react-native';
import type { ChipField, FacetField } from '../lib/opportunityListing';

/**
 * The eight opportunity categories of the Opportunities screen. The same list as the admin dashboard's Opportunities queue tabs and "Opportunity
 * type", and as the API's counts (kredibble-backend/src/lib/opportunity-categories.js): keep the three in step.
 *
 * - `card`: the card artwork (purple, with the category's 3D icon). The title and the number of listings are drawn on top of it.
 * - `key`: the category, also the key of its count in GET /opportunities/category-counts.
 * - `apiTypes`: the opportunity types the category's list asks the API for (the API matches a type's singular and plural spelling).
 * - `route`: the screen a card opens. Events, grants and jobs keep their own screens; the others share the category screen.
 */
export interface OpportunityCategory {
  key: string;
  title: string;
  card: ImageSourcePropType;
  apiTypes: string[];
  route: string;
  /**
   * The category's list screen: the search hint, what one listing is called, the facts a card shows (in this order, the first four that the listing
   * has), the details the filter offers, and the label of its certificate switch when it has one.
   */
  list: { placeholder: string; noun: string; chips: ChipField[]; facets: FacetField[]; certificate?: string };
}

export const OPPORTUNITY_CATEGORIES: OpportunityCategory[] = [
  { key: 'events', title: 'Events & Competitions', card: require('../../assets/images/opp_card_events.png'), apiTypes: ['event', 'competition'], route: '/events', list: { placeholder: 'Search', noun: 'listing', chips: ['format', 'duration', 'cost', 'place'], facets: [] } },
  { key: 'volunteer', title: 'Volunteerism & Community Service', card: require('../../assets/images/opp_card_volunteer.png'), apiTypes: ['volunteer'], route: '/opportunities/category?key=volunteer', list: { placeholder: 'Search volunteer roles', noun: 'volunteer role', chips: ['focus', 'format', 'duration', 'certificate', 'place', 'cost'], facets: ['focus'], certificate: 'Certificate or training provided' } },
  { key: 'funding', title: 'Awards, Grants & Funding', card: require('../../assets/images/opp_card_funding.png'), apiTypes: ['grant'], route: '/grants', list: { placeholder: 'Search', noun: 'listing', chips: ['format', 'duration', 'cost', 'place'], facets: [] } },
  { key: 'jobs', title: 'Jobs & Internships', card: require('../../assets/images/opp_card_jobs.png'), apiTypes: ['jobs', 'internships'], route: '/jobs', list: { placeholder: 'Search', noun: 'listing', chips: ['format', 'duration', 'cost', 'place'], facets: [] } },
  { key: 'scholarships', title: 'Scholarships', card: require('../../assets/images/opp_card_scholarships.png'), apiTypes: ['scholarship'], route: '/opportunities/category?key=scholarships', list: { placeholder: 'Search scholarships', noun: 'scholarship', chips: ['funding', 'level', 'focus', 'place', 'duration', 'format'], facets: ['funding', 'level', 'focus'] } },
  { key: 'fellowships', title: 'Fellowships & Exchange Programmes', card: require('../../assets/images/opp_card_fellowships.png'), apiTypes: ['fellowship'], route: '/opportunities/category?key=fellowships', list: { placeholder: 'Search fellowships and exchanges', noun: 'fellowship', chips: ['funding', 'level', 'duration', 'focus', 'format', 'place'], facets: ['funding', 'level', 'focus'] } },
  { key: 'training', title: 'Training & Workshops', card: require('../../assets/images/opp_card_training.png'), apiTypes: ['training', 'training-workshop'], route: '/opportunities/category?key=training', list: { placeholder: 'Search training and workshops', noun: 'training', chips: ['funding', 'level', 'format', 'certificate', 'duration', 'focus', 'place'], facets: ['funding', 'level', 'focus'], certificate: 'Certificate offered' } },
  { key: 'mentorship', title: 'Mentorship & Career Development', card: require('../../assets/images/opp_card_mentorship.png'), apiTypes: ['mentorship'], route: '/opportunities/category?key=mentorship', list: { placeholder: 'Search mentorship programmes', noun: 'mentorship programme', chips: ['funding', 'focus', 'format', 'duration', 'place'], facets: ['funding', 'focus'] } },
];

export const getOpportunityCategory = (key: string | undefined): OpportunityCategory | undefined =>
  OPPORTUNITY_CATEGORIES.find((category) => category.key === key);
