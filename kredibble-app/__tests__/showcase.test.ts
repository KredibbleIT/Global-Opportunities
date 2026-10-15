import { SAMPLE_SHOWCASE, initialsOf, showcaseView, type ShowcaseData } from '../src/constants/mockShowcase';
import { getShowcase } from '../src/lib/showcase';

// All data here is FAKE.
const data = (over: Partial<ShowcaseData> = {}): ShowcaseData => ({ ...SAMPLE_SHOWCASE, ...over });

describe('Meet our people: what the screen shows', () => {
  it('shows visible categories in order, each with its visible entries in order', () => {
    const view = showcaseView({
      categories: [
        { id: 'b', key: 'custom', name: 'B', kind: 'person', order: 2, visible: true },
        { id: 'a', key: 'custom', name: 'A', kind: 'person', order: 1, visible: true },
      ],
      entries: [
        { id: '1', categoryId: 'b', name: 'B2', title: '', bio: '', visible: true, order: 2 },
        { id: '2', categoryId: 'b', name: 'B1', title: '', bio: '', visible: true, order: 1 },
        { id: '3', categoryId: 'a', name: 'A1', title: '', bio: '', visible: true, order: 1 },
      ],
    });
    expect(view.map((group) => group.category.name)).toEqual(['A', 'B']);
    expect(view[1].entries.map((entry) => entry.name)).toEqual(['B1', 'B2']);
  });

  it('leaves out hidden entries, hidden categories and empty categories', () => {
    const view = showcaseView(
      data({
        categories: [
          ...SAMPLE_SHOWCASE.categories,
          { id: 'hidden-cat', key: 'custom', name: 'Hidden category', kind: 'person', order: 9, visible: false },
          { id: 'empty-cat', key: 'custom', name: 'Empty category', kind: 'person', order: 10, visible: true },
        ],
        entries: [...SAMPLE_SHOWCASE.entries, { id: 'x', categoryId: 'hidden-cat', name: 'Test In Hidden Category', title: '', bio: '', visible: true, order: 1 }],
      }),
    );
    const names = view.flatMap((group) => group.entries.map((entry) => entry.name));
    expect(names).not.toContain('Test Ambassador Three'); // hidden entry
    expect(names).not.toContain('Test In Hidden Category'); // a hidden category hides everything in it
    expect(view.map((group) => group.category.name)).not.toContain('Empty category');
    expect(view.map((group) => group.category.name)).toEqual(['Ambassadors', 'Team', 'Partners', 'Stakeholders']);
  });

  it('shows nothing for an empty list', () => {
    expect(showcaseView({ categories: [], entries: [] })).toEqual([]);
  });

  it('makes initials from the first and last word of a name', () => {
    expect(initialsOf('Test Ambassador One')).toBe('TO');
    expect(initialsOf('Ama Boateng')).toBe('AB');
    expect(initialsOf('  Kofi  ')).toBe('KO');
    expect(initialsOf('')).toBe('?');
  });
});

describe('getShowcase', () => {
  const globalWithDev = globalThis as unknown as { __DEV__?: boolean };
  const original = globalWithDev.__DEV__;
  afterEach(() => {
    globalWithDev.__DEV__ = original;
  });

  it('returns the fake sample list in development', async () => {
    globalWithDev.__DEV__ = true;
    expect((await getShowcase()).entries.length).toBeGreaterThan(0);
  });

  it('returns an empty list in a release build, so no invented people are ever shown', async () => {
    globalWithDev.__DEV__ = false;
    expect(await getShowcase()).toEqual({ categories: [], entries: [] });
  });
});
