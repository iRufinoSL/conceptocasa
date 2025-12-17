/**
 * Normalizes text for search by removing accents and converting to lowercase
 * This allows searches like "Gomez" to match "Gómez"
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Checks if the search term is found in the text, ignoring accents and case
 */
export function searchMatch(text: string | null | undefined, searchTerm: string): boolean {
  if (!searchTerm) return true;
  return normalizeSearchText(text).includes(normalizeSearchText(searchTerm));
}
