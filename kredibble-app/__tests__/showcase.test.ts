import * as SecureStore from 'expo-secure-store';
import { initialsOf, showcaseView, type ShowcaseData, type ShowcaseEntry } from '../src/constants/mockShowcase';
import { getShowcase } from '../src/lib/showcase';

// All data here is FAKE (no real person).
const person = (id: string, categoryId: string, order: number, name: string, visible = true): ShowcaseEntry => ({
  id, categoryId, order, name, title: 'Tester', bio: '', visible,
});

const FIXTURE: ShowcaseData = {
  categories: [
    { id: 'sc-ambassadors', key: 'ambassadors', name: 'Ambassadors', kind: 'person', order: 1, visible: true },
    { id: 'sc-team', key: 'team', name: 'Team', kind: 'person', order: 2, visible: true },
    { id: 'sc-partners', key: 'partners', name: 'Partners', kind: 'organisation', order: 3, visible: true },
    { id: 'sc-stakeholders', key: 'stakeholders', name: 'Stakeholders', kind: 'person', order: 4, visible: true },
  ],
  entries: [
    person('se-1', 'sc-ambassadors', 1, 'Test Ambassador One'),
    person('se-3', 'sc-ambassadors', 2, 'Test Ambassador Three', false),
    person('se-4', 'sc-team', 1, 'Test Desk Lead'),
    person('se-6', 'sc-partners', 1, 'Example Partner Foundation'),
    person('se-8', 'sc-stakeholders', 1, 'Test Stakeholder One'),
  ],
};

const data = (over: Partial<ShowcaseData> = {}): ShowcaseData => ({ ...FIXTURE, ...over });

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
          ...FIXTURE.categories,
          { id: 'hidden-cat', key: 'custom', name: 'Hidden category', kind: 'person', order: 9, visible: false },
          { id: 'empty-cat', key: 'custom', name: 'Empty category', kind: 'person', order: 10, visible: true },
        ],
        entries: [...FIXTURE.entries, { id: 'x', categoryId: 'hidden-cat', name: 'Test In Hidden Category', title: '', bio: '', visible: true, order: 1 }],
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
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await SecureStore.setItemAsync('kredibble_app_token', 'test-token');
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await SecureStore.deleteItemAsync('kredibble_app_token');
  });

  it('reads GET /showcase with the signed-in token and returns what the server sent', async () => {
    let calledUrl = '';
    let calledHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((url: string, init: RequestInit) => {
      calledUrl = String(url);
      calledHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: FIXTURE }) });
    });
    await expect(getShowcase()).resolves.toEqual(FIXTURE);
    expect(calledUrl.endsWith('/showcase')).toBe(true);
    expect(calledHeaders.Authorization).toBe('Bearer test-token');
  });

  it('rejects with the server message, so the screen shows its error and a retry', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: { message: 'Showcase is unavailable' } }) });
    await expect(getShowcase()).rejects.toThrow('Showcase is unavailable');
  });
});
