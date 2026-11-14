import { getEvents, getEventById, getGrants, formatEventDate } from '../src/lib/api';

jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: jest.fn(() => 'http://localhost:4000/api') },
}));

type Route = { status: number; body: unknown };

/** Answers fetch by path: the first route whose key the URL contains wins; anything else is a 404. */
const mockApi = (routes: Record<string, Route>) => {
  const fetchMock = jest.fn(async (url: string) => {
    const match = Object.keys(routes).find((key) => url.includes(key));
    const route = match ? routes[match] : { status: 404, body: { error: { message: 'Not found' } } };
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: async () => route.body,
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe('GOD-T63: events and grants posted from the admin dashboard reach the app', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('the events list includes dashboard events (opportunities of type event)', async () => {
    const fetchMock = mockApi({
      '/opportunities?type=event': {
        status: 200,
        body: { data: [{ id: 'opp-1', title: 'Career Fair', format: 'online', company: 'G.O.D' }] },
      },
      '/events': { status: 200, body: { data: [{ id: 'evt-1', title: 'Old Meetup' }] } },
    });

    const events = await getEvents({ q: 'fair' });

    expect(events.map((event) => event.title)).toEqual(['Career Fair', 'Old Meetup']);
    expect(events[0]).toMatchObject({ eventStyle: 'Online', organizer: 'G.O.D' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/opportunities?type=event&q=fair'))).toBe(true);
  });

  test('one source failing still shows the other', async () => {
    mockApi({
      '/opportunities?type=event': { status: 200, body: { data: [{ id: 'opp-1', title: 'Career Fair' }] } },
      '/events': { status: 500, body: { error: { message: 'Server error' } } },
    });

    await expect(getEvents()).resolves.toHaveLength(1);
  });

  test('both sources failing rejects, so the screen can show an error instead of loading forever', async () => {
    mockApi({
      '/opportunities': { status: 500, body: { error: { message: 'Server error' } } },
      '/events': { status: 500, body: { error: { message: 'Server error' } } },
    });

    await expect(getEvents()).rejects.toThrow('Server error');
  });

  test('a listing in both sources appears once', async () => {
    mockApi({
      '/opportunities?type=grant': { status: 200, body: { data: [{ id: 'same-id', title: 'Seed Grant' }] } },
      '/grants': { status: 200, body: { data: [{ id: 'same-id', title: 'Seed Grant' }] } },
    });

    await expect(getGrants()).resolves.toHaveLength(1);
  });

  test('an event id that is not a dashboard listing opens from the events collection', async () => {
    mockApi({
      '/opportunities/evt-1': { status: 404, body: { error: { message: 'Not found' } } },
      '/events/evt-1': { status: 200, body: { data: { id: 'evt-1', title: 'Old Meetup' } } },
    });

    await expect(getEventById('evt-1')).resolves.toMatchObject({ id: 'evt-1', title: 'Old Meetup' });
  });

  test('a dashboard event shows its date: the admin saves eventAt, the screens read eventDateTime and date', async () => {
    mockApi({
      '/opportunities?type=event': {
        status: 200,
        body: { data: [{ id: 'opp-1', title: 'Career Fair', eventAt: '2026-12-05T18:00' }] },
      },
      '/events': { status: 200, body: { data: [] } },
    });

    const [event] = await getEvents();

    expect(event.eventDateTime).toBe(formatEventDate('2026-12-05T18:00'));
    expect(event.eventDateTime).toMatch(/5 Dec 2026/);
    expect(event.date).toBe(event.eventDateTime);
  });
});

describe('formatEventDate', () => {
  test('formats a timestamp readably', () => {
    expect(formatEventDate('2026-12-05T18:00')).toMatch(/Sat.*5 Dec 2026.*18:00/);
  });

  test('keeps text that is not a date as written', () => {
    expect(formatEventDate('Every Saturday morning')).toBe('Every Saturday morning');
  });

  test('nothing to show for an empty value', () => {
    expect(formatEventDate('')).toBeUndefined();
    expect(formatEventDate(undefined)).toBeUndefined();
  });
});
