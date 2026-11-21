/**
 * Type-ahead for option lists (the Select dropdown): find the option that starts with what was typed, so a long list
 * such as the 199 countries can be reached from the keyboard ("united k" finds United Kingdom).
 */

/** Lower case without accents, so a search for "cote" matches "Côte d'Ivoire" and "sao" matches "São Tomé". */
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The index of the option a type-ahead search lands on, or undefined when nothing matches.
 * `query` is the folded text typed so far. One letter, or the same letter typed again ("ss"), steps to the NEXT option
 * starting with it after `active`, so pressing S repeatedly walks through the S countries. A longer search ("sou") is
 * matched from the current option, so the highlight stays put while the typed text still matches it.
 */
export function typeaheadMatch(labels: readonly string[], query: string, active: number): number | undefined {
  if (!query) return undefined;
  const repeated = [...query].every((char) => char === query[0]);
  const text = repeated ? query[0] : query;
  const start = repeated ? active + 1 : active;
  const order = [...labels.keys()];
  return [...order.slice(start), ...order.slice(0, start)].find((index) => foldForSearch(labels[index]).startsWith(text));
}
