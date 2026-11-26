import {
  appliedLabel,
  emptyMessage,
  filterByStage,
  stageOf,
  toApplicationCard,
  toApplicationCards,
  typeLabelOf,
} from '../src/lib/application-status';

// GOD-T91: Profile → Applications status printed "Ghana (Remote)" on every card, filed fellowships under Jobs, showed offers
// as "Interview" and shortlistings as "In review", and told someone who never applied that a filter hid everything.
describe('GOD-T91: Applications status', () => {
  const apiItem = (overrides: Record<string, unknown> = {}, opportunity: Record<string, unknown> | null = {}) => ({
    id: 'app-1',
    status: 'Applied',
    createdAt: '2026-11-12T15:46:47.517Z',
    opportunity: opportunity && {
      id: 'opp-1',
      title: 'Thrive Capital Summer Fellowship 2027',
      company: 'Thrive Capital',
      type: 'fellowship',
      location: 'New York or San Francisco',
      ...opportunity,
    },
    ...overrides,
  });

  it('each hirer stage keeps its own name', () => {
    expect(stageOf('Applied')).toBe('In review');
    expect(stageOf('Shortlisted')).toBe('Shortlisted');
    expect(stageOf('Interviewing')).toBe('Interview');
    expect(stageOf('Offered')).toBe('Offered');
    expect(stageOf('Rejected')).toBe('Rejected');
    expect(stageOf(undefined)).toBe('In review');
  });

  it('a card shows the listing\'s real type and location, never a fixed one', () => {
    const card = toApplicationCard(apiItem());
    expect(card).toEqual({
      id: 'app-1',
      opportunityId: 'opp-1',
      title: 'Thrive Capital Summer Fellowship 2027',
      company: 'Thrive Capital',
      typeLabel: 'Fellowship',
      location: 'New York or San Francisco',
      stage: 'In review',
      appliedAt: '2026-11-12T15:46:47.517Z',
    });
    expect(JSON.stringify(card)).not.toContain('Ghana');
  });

  it('every kind of listing is listed together, and an unknown type has no label', () => {
    expect(['job', 'internships', 'scholarship', 'grant', 'training-workshop'].map(typeLabelOf)).toEqual(['Job', 'Internship', 'Scholarship', 'Grant', 'Training']);
    expect(typeLabelOf('something-new')).toBe('');
    const cards = toApplicationCards({ data: [apiItem(), apiItem({ id: 'app-2' }, { type: 'job' })] });
    expect(filterByStage(cards, 'All')).toHaveLength(2);
  });

  it('a removed listing still shows, without a link', () => {
    const card = toApplicationCard(apiItem({}, null));
    expect(card.opportunityId).toBeNull();
    expect(card.title).toBe('A listing that was removed');
  });

  it('the stage filter keeps only that stage', () => {
    const cards = toApplicationCards([apiItem(), apiItem({ id: 'app-2', status: 'Offered' }), apiItem({ id: 'app-3', status: 'Rejected' })]);
    expect(filterByStage(cards, 'Offered').map((card) => card.id)).toEqual(['app-2']);
    expect(filterByStage(cards, 'Interview')).toEqual([]);
  });

  it('the empty message says why the list is empty', () => {
    expect(emptyMessage(0, 'All')).toMatch(/haven't applied to anything yet/);
    expect(emptyMessage(3, 'Offered')).toBe('No applications are offered right now.');
    expect(emptyMessage(3, 'In review')).toBe('No applications are in review right now.');
  });

  it('the applied date reads like a date, and a missing one is left out', () => {
    expect(appliedLabel('2026-11-12T15:46:47.517Z')).toMatch(/^Applied 1[23] Nov 2026$/);
    expect(appliedLabel('')).toBe('');
    expect(toApplicationCards(undefined)).toEqual([]);
  });
});
