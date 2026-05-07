// ── Slug Generator ───────────────────────────────────────────────────────────

/**
 * Convert a string into a URL-friendly slug.
 * @param text - Input string (e.g., a product name)
 * @returns Lowercase, hyphen-separated slug with no special characters
 */
export function generateSlug(text: string): string {
  return (
    text
      .normalize('NFD')                   // decompose accented chars (é → e + accent)
      .replace(/[\u0300-\u036f]/g, '')    // strip combining diacritical marks
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')        // non-alphanumeric → hyphen
      .replace(/^-+|-+$/g, '')            // trim leading/trailing hyphens
  );
}
