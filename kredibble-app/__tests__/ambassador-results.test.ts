import { countLabel, monthLabel, placeLabel, rankLabel } from '../src/lib/ambassador-results';

// GOD-T106: the ambassador card and the leaderboard screen word the month's results.
describe('GOD-T106: ambassador results wording', () => {
  it('reads the month as words', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(monthLabel('2027-01')).toBe('January 2027');
    expect(monthLabel('soon')).toBe('soon');
  });

  it('gives the rank among the month\'s ambassadors, or says there is none yet', () => {
    expect(rankLabel(2, 14)).toBe('#2 of 14');
    expect(rankLabel(null, 14)).toBe('Not ranked yet');
  });

  it('counts in the singular and plural', () => {
    expect(countLabel(1, 'verified sign-up')).toBe('1 verified sign-up');
    expect(countLabel(0, 'click')).toBe('0 clicks');
    expect(countLabel(3, 'share')).toBe('3 shares');
  });

  it('shows whichever of campus and country is known', () => {
    expect(placeLabel({ campus: 'Test Campus', country: 'Ghana' })).toBe('Test Campus · Ghana');
    expect(placeLabel({ campus: '', country: 'Ghana' })).toBe('Ghana');
    expect(placeLabel({ campus: ' ', country: '' })).toBe('');
  });
});
