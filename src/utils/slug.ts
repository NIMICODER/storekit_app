/**
 * src/utils/slug.ts — URL-Friendly Slug Generator
 *
 * PURPOSE:
 *   Converts a product name (or any string) into a URL-friendly "slug".
 *   Slugs are used in SEO-friendly URLs instead of UUIDs:
 *
 *     /products/wireless-bluetooth-headphones   ← slug (readable!)
 *     /products/550e8400-e29b-41d4-a716-...     ← UUID (ugly in browser bar)
 *
 * WHAT THIS DOES:
 *   "Wireless Bluetooth Headphones!!" → "wireless-bluetooth-headphones"
 *   "  $100 OFF Sale!!!  "           → "100-off-sale"
 *   "café & résumé"                  → "cafe-resume"
 *
 * HOW IT WORKS:
 *   1. Normalize Unicode accents (é → e, ñ → n, ü → u)
 *   2. Lowercase everything
 *   3. Replace non-alphanumeric characters with hyphens
 *   4. Collapse multiple consecutive hyphens into one
 *   5. Trim leading/trailing hyphens
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   C# doesn't have a built-in slug generator either. You'd typically:
 *     1. Use a NuGet package like `Slugify` or `Humanizer`
 *     2. Or write a similar helper:
 *
 *     public static string GenerateSlug(string text) {
 *       text = text.Normalize(NormalizationForm.FormD);
 *       text = Regex.Replace(text, @"[\u0300-\u036f]", ""); // remove accents
 *       text = text.ToLower();
 *       text = Regex.Replace(text, @"[^a-z0-9]+", "-");     // non-alphanum → hyphen
 *       text = text.Trim('-');
 *       return text;
 *     }
 *
 * PURE FUNCTION:
 * ───────────────────────────────────────────────────────────────────────────
 *   This function has NO side effects and NO dependencies — it takes a string
 *   and returns a string. Same input always produces same output.
 *   This makes it trivially easy to test and reuse.
 *
 *   In functional programming terms, it's a "pure function" — the gold standard
 *   for utility code. C# equivalent: a static method with no state.
 */

// ─────────────────────────────────────────────────────────────────────────────
// generateSlug — Convert any string to a URL-friendly slug
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a string into a URL-friendly slug.
 *
 * @param text - The input string (e.g., a product name)
 * @returns A lowercase, hyphen-separated slug with no special characters
 *
 * @example
 *   generateSlug('Wireless Headphones')     // → 'wireless-headphones'
 *   generateSlug('100% Organic Coffee')     // → '100-organic-coffee'
 *   generateSlug('café résumé')             // → 'cafe-resume'
 *   generateSlug('  --hello--world--  ')    // → 'hello-world'
 */
export function generateSlug(text: string): string {
  return (
    text
      // Step 1: Normalize Unicode — decompose accented characters into base + combining mark.
      //
      // "café" → "cafe\u0301" (e + combining acute accent)
      //
      // NFD = "Normalization Form Decomposition"
      // This splits characters like é into two parts: e + ´ (accent mark)
      // Then we can strip the accent marks with a regex.
      //
      // JavaScript's String.normalize() does the same thing as
      // C#'s String.Normalize(NormalizationForm.FormD)
      .normalize('NFD')

      // Step 2: Remove combining diacritical marks (the accent parts from step 1).
      //
      // Unicode range \u0300-\u036f contains ALL combining accent marks:
      //   \u0301 = combining acute accent (´)
      //   \u0300 = combining grave accent (`)
      //   \u0308 = combining diaeresis (¨)  etc.
      //
      // After this: "cafe\u0301" → "cafe"
      .replace(/[\u0300-\u036f]/g, '')

      // Step 3: Lowercase everything — slugs are always lowercase.
      .toLowerCase()

      // Step 4: Replace ANY character that is NOT a letter or digit with a hyphen.
      //
      // [^a-z0-9] matches: spaces, punctuation, symbols, etc.
      // The `+` quantifier means "one or more" — so "hello   world" becomes
      // "hello-world" (not "hello---world").
      .replace(/[^a-z0-9]+/g, '-')

      // Step 5: Trim leading and trailing hyphens.
      //
      // After step 4, input like "  hello  " would be "-hello-"
      // This regex removes hyphens at the start (^-+) and end (-+$).
      .replace(/^-+|-+$/g, '')
  );
}
