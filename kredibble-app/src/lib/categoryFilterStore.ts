import type { FacetField, FacetSelection } from './opportunityListing';

/**
 * The filters chosen for one opportunity category, kept while the person moves between the category list and its filter page (like the other
 * stores in this app, in memory). The list sets the choices the filter page offers (the values its listings really have); the filter page sets the
 * selection when "Apply Filters" is pressed; the list reads it back when it comes into view.
 */
export interface CategoryFilterState {
  selection: FacetSelection;
  certificateOnly: boolean;
  /** Text matched against the listing's city, region or country. */
  location: string;
}

export const EMPTY_CATEGORY_FILTERS: CategoryFilterState = { selection: {}, certificateOnly: false, location: '' };

export type CategoryFilterOptions = Partial<Record<FacetField, string[]>>;

const states = new Map<string, CategoryFilterState>();
const options = new Map<string, CategoryFilterOptions>();

export const categoryFilters = {
  get: (key: string): CategoryFilterState => states.get(key) ?? EMPTY_CATEGORY_FILTERS,
  set: (key: string, state: CategoryFilterState) => {
    states.set(key, state);
  },
  reset: (key: string) => {
    states.delete(key);
  },
  getOptions: (key: string): CategoryFilterOptions => options.get(key) ?? {},
  setOptions: (key: string, value: CategoryFilterOptions) => {
    options.set(key, value);
  },
};

/** How many filters are on: every chosen value, the certificate switch and the location. */
export const categoryFilterCount = (state: CategoryFilterState): number =>
  Object.values(state.selection).reduce((total, values) => total + (values?.length ?? 0), 0) + (state.certificateOnly ? 1 : 0) + (state.location.trim() ? 1 : 0);
