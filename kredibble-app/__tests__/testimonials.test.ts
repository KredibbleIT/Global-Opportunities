import { TESTIMONIALS_ID, toTestimonialCard, toTestimonialCards } from '../src/lib/testimonials';

// GOD-T110: Meet our people shows the testimonials approved in the admin. ALL DATA IS FAKE.
describe('GOD-T110: testimonials on Meet our people', () => {
  const approved = {
    id: 't1',
    name: 'Test Fellow',
    author: 'Test Fellow',
    role: 'Fellow, Example Programme',
    comment: 'The desk helped me find my fellowship.',
    quote: 'The desk helped me find my fellowship.',
    photo: 'https://cdn.example.com/p.jpg',
    status: 'approved',
  };

  it('a testimonial becomes a quote card with its name, role, words and photo', () => {
    expect(toTestimonialCard(approved)).toEqual({
      id: 't1',
      name: 'Test Fellow',
      role: 'Fellow, Example Programme',
      quote: 'The desk helped me find my fellowship.',
      photoUrl: 'https://cdn.example.com/p.jpg',
    });
  });

  it('only approved testimonials with words and a name are shown, from either answer shape', () => {
    const cards = toTestimonialCards({
      data: [approved, { ...approved, id: 't2', status: 'pending' }, { ...approved, id: 't3', quote: '', comment: ' ' }, { ...approved, id: 't4', name: '', author: '' }],
    });
    expect(cards.map((card) => card.id)).toEqual(['t1']);
    expect(toTestimonialCards([approved])).toHaveLength(1);
    expect(toTestimonialCards(undefined)).toEqual([]);
  });

  it('a photo that is not https falls back to initials', () => {
    expect(toTestimonialCard({ ...approved, photo: 'http://insecure.example.com/p.jpg' })?.photoUrl).toBeNull();
    expect(toTestimonialCard({ ...approved, photo: null })?.photoUrl).toBeNull();
  });

  it('the Testimonials chip id cannot clash with a category id', () => {
    expect(TESTIMONIALS_ID).not.toMatch(/^[a-f0-9]{24}$/);
  });
});
