import {
  applyUrlOf, cardChips, daysLeft, deadlineBadge, facetCount, facetValue, facetValues, fundingOf, isClosed, isClosingSoon, matchesFacets, orgOf, placeOf, toLines,
} from '../src/lib/opportunityListing';

// The helpers behind the category list and the listing screen. ALL DATA IS FAKE.

const NOW = new Date(2026, 10, 16, 15, 30); // 16 Nov 2026, afternoon
const at = (offsetDays: number) => new Date(2026, 10, 16 + offsetDays).toISOString();

describe('deadlines', () => {
  it('counts whole days from today, whatever the time of day', () => {
    expect(daysLeft({ deadline: at(0) }, NOW)).toBe(0);
    expect(daysLeft({ closesAt: at(25) }, NOW)).toBe(25);
    expect(daysLeft({ deadline: at(-4) }, NOW)).toBe(-4);
    expect(daysLeft({}, NOW)).toBeNull();
    expect(daysLeft({ deadline: 'not a date' }, NOW)).toBeNull();
  });

  it('words the badge and picks its tone', () => {
    expect(deadlineBadge({ deadline: at(25) }, NOW)).toEqual({ text: 'Closes in 25 days', tone: 'open' });
    expect(deadlineBadge({ deadline: at(14) }, NOW)).toEqual({ text: 'Closes in 14 days', tone: 'soon' });
    expect(deadlineBadge({ deadline: at(1) }, NOW)).toEqual({ text: 'Closes tomorrow', tone: 'soon' });
    expect(deadlineBadge({ deadline: at(0) }, NOW)).toEqual({ text: 'Closes today', tone: 'soon' });
    expect(deadlineBadge({ deadline: at(-1) }, NOW)).toEqual({ text: 'Closed', tone: 'closed' });
    expect(deadlineBadge({}, NOW)).toEqual({ text: 'Open', tone: 'none' });
  });

  it('knows closed and closing soon', () => {
    expect(isClosed({ deadline: at(-1) }, NOW)).toBe(true);
    expect(isClosed({ deadline: at(0) }, NOW)).toBe(false);
    expect(isClosed({}, NOW)).toBe(false);
    expect(isClosingSoon({ deadline: at(14) }, NOW)).toBe(true);
    expect(isClosingSoon({ deadline: at(15) }, NOW)).toBe(false);
    expect(isClosingSoon({ deadline: at(-1) }, NOW)).toBe(false);
  });
});

describe('what a listing shows', () => {
  it('names the organisation, with fallbacks', () => {
    expect(orgOf({ offeringOrganization: 'A', company: 'B' })).toBe('A');
    expect(orgOf({ company: 'B' })).toBe('B');
    expect(orgOf({})).toBe('');
  });

  it('adds the country to the location only when it is not already there', () => {
    expect(placeOf({ location: 'Accra', country: 'Ghana' })).toBe('Accra, Ghana');
    expect(placeOf({ location: 'Accra, Ghana', country: 'Ghana' })).toBe('Accra, Ghana');
    expect(placeOf({ country: 'Kenya' })).toBe('Kenya');
    expect(placeOf({})).toBeNull();
  });

  it('shows the facts of the category in order, without empty or repeated ones, at most four', () => {
    const item = { format: 'online', durationLabel: '2 days', costLabel: 'Free', location: 'Online', country: 'Ghana' };
    expect(cardChips(item, ['format', 'duration', 'cost', 'place'])).toEqual(['Online', '2 days', 'Free', 'Online, Ghana']);
    expect(cardChips(item, ['cost', 'duration'])).toEqual(['Free', '2 days']);
    expect(cardChips({ format: 'hybrid', location: 'hybrid' }, ['format', 'place'])).toEqual(['Hybrid']);
    expect(cardChips({}, ['format', 'duration'])).toEqual([]);
  });
});

describe('apply and text blocks', () => {
  it('uses the listing\'s own https link for Apply, and nothing else', () => {
    expect(applyUrlOf({ applyUrl: 'https://example.com/apply' })).toBe('https://example.com/apply');
    expect(applyUrlOf({ applicationUrl: 'http://example.com' })).toBe('http://example.com');
    expect(applyUrlOf({ applyUrl: 'javascript:alert(1)' })).toBeNull();
    expect(applyUrlOf({ applyUrl: 'mailto:a@example.com' })).toBeNull();
    expect(applyUrlOf({})).toBeNull();
  });

  it('splits a text block into bullet lines', () => {
    expect(toLines('• one\n- two\n\n  three  ')).toEqual(['one', 'two', 'three']);
    expect(toLines('A single paragraph.')).toEqual(['A single paragraph.']);
    expect(toLines(undefined)).toEqual([]);
  });
});

describe('category details', () => {
  const masters = { fundingType: 'fully-funded', level: "Master's", focusArea: 'Health', certificateOffered: false };
  const phd = { fundingType: 'partially-funded', level: 'PhD', focusArea: 'Health', certificateOffered: true };
  const old = { costLabel: 'Free to apply' }; // posted before the details existed

  it('words the funding: the structured type first, else the free-text cost', () => {
    expect(fundingOf(masters)).toBe('Fully funded');
    expect(fundingOf(old)).toBe('Free to apply');
    expect(fundingOf({})).toBeNull();
  });

  it('puts the saved details on the card in the order of the category, and a listing without them still shows what it has', () => {
    expect(cardChips({ ...masters, location: 'Accra', country: 'Ghana' }, ['funding', 'level', 'focus', 'place'])).toEqual(['Fully funded', "Master's", 'Health', 'Accra, Ghana']);
    expect(cardChips(phd, ['certificate', 'funding'])).toEqual(['Certificate', 'Partially funded']);
    expect(cardChips({ ...old, location: 'Accra' }, ['funding', 'level', 'focus', 'cost', 'place'])).toEqual(['Free to apply', 'Accra']);
  });

  it('offers the values the listings really have, each once', () => {
    expect(facetValues([masters, phd, old], 'level')).toEqual(["Master's", 'PhD']);
    expect(facetValues([masters, phd, old], 'focus')).toEqual(['Health']);
    expect(facetValues([masters, phd, old], 'funding')).toEqual(['Fully funded', 'Partially funded']);
    expect(facetValue(old, 'level')).toBeNull();
    expect(facetValues([], 'level')).toEqual([]);
  });

  it('keeps a listing when it has one of the chosen values for every facet that has a choice', () => {
    expect(matchesFacets(masters, {})).toBe(true);
    expect(matchesFacets(masters, { level: ["Master's"] })).toBe(true);
    expect(matchesFacets(phd, { level: ["Master's"] })).toBe(false);
    expect(matchesFacets(phd, { level: ["Master's", 'PhD'] })).toBe(true);
    expect(matchesFacets(masters, { level: ["Master's"], funding: ['Partially funded'] })).toBe(false);
    expect(matchesFacets(old, { level: ["Master's"] })).toBe(false); // no level saved
    expect(matchesFacets(masters, { level: [] })).toBe(true); // nothing chosen
    expect(matchesFacets(masters, {}, true)).toBe(false);
    expect(matchesFacets(phd, {}, true)).toBe(true);
  });

  it('counts the filters that are on', () => {
    expect(facetCount({})).toBe(0);
    expect(facetCount({ level: ['PhD'], focus: ['Health', 'Law'] }, true)).toBe(4);
  });
});
