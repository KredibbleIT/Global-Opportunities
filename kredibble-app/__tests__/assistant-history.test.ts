import { toAssistantHistory, ChatBubble } from '../src/lib/assistant-history';

// GOD-T68: the API refuses a history that doesn't start with the user; the screen used
// to send its own greeting first, so every question failed.
describe('toAssistantHistory', () => {
  const greeting: ChatBubble = { sender: 'ai', text: "Hi, I'm your AI assistant.", local: true };

  test('the greeting is never sent; the history starts with the user', () => {
    expect(toAssistantHistory([greeting, { sender: 'user', text: 'How do I write a CV?' }])).toEqual([
      { role: 'user', content: 'How do I write a CV?' },
    ]);
  });

  test('earlier error notes are not sent as assistant answers', () => {
    const history = toAssistantHistory([
      greeting,
      { sender: 'user', text: 'First question' },
      { sender: 'ai', text: 'Unable to reach assistant: ...', local: true },
      { sender: 'user', text: 'Second try' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'user', content: 'Second try' },
    ]);
  });

  test('real answers are kept as assistant turns', () => {
    expect(toAssistantHistory([
      greeting,
      { sender: 'user', text: 'Q1' },
      { sender: 'ai', text: 'A1' },
      { sender: 'user', text: 'Q2' },
    ]).map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
  });

  test('when the last ten turns begin with an answer, it is dropped so a user turn comes first', () => {
    const bubbles: ChatBubble[] = [];
    for (let i = 1; i <= 6; i += 1) {
      bubbles.push({ sender: 'user', text: `Q${i}` }, { sender: 'ai', text: `A${i}` });
    }
    bubbles.push({ sender: 'user', text: 'Q7' });
    const history = toAssistantHistory(bubbles);
    expect(history[0]).toEqual({ role: 'user', content: 'Q3' });
    expect(history.length).toBeLessThanOrEqual(10);
  });

  test('nothing to send without a user turn', () => {
    expect(toAssistantHistory([greeting])).toEqual([]);
  });
});
