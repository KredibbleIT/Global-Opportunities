import type { AssistantChatMessage } from './api';

/** A bubble on the assistant screen. `local` ones (the greeting, error notes) are shown, never sent. */
export interface ChatBubble {
  sender: 'ai' | 'user';
  text: string;
  local?: boolean;
}

/**
 * Builds the conversation the API receives from what the screen shows (GOD-T68).
 *
 * The API refuses a history that doesn't start with the user ("The first message
 * must have role user"). The screen used to send everything it showed, starting
 * with its own greeting, so every question failed. Now the greeting and error notes
 * (`local`) stay on the screen, the last `limit` turns are kept, and anything before
 * the first user turn is dropped.
 * @param bubbles - what the screen shows, oldest first
 * @param limit - how many recent turns to send (the API takes up to 10)
 * @returns the history to send, starting with a user turn (empty if there is none)
 */
export function toAssistantHistory(bubbles: ChatBubble[], limit = 10): AssistantChatMessage[] {
  const turns = bubbles
    .filter((bubble) => !bubble.local && bubble.text.trim() !== '')
    .slice(-limit)
    .map((bubble): AssistantChatMessage => ({
      role: bubble.sender === 'user' ? 'user' : 'assistant',
      content: bubble.text,
    }));
  const firstUser = turns.findIndex((turn) => turn.role === 'user');
  return firstUser === -1 ? [] : turns.slice(firstUser);
}
