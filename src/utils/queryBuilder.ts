/**
 * src/utils/queryBuilder.ts — Dynamic Query Utilities for Prisma
 *
 * PURPOSE:
 *   Provides reusable functions for building dynamic Prisma queries:
 *     - parseSortParam()    → converts "price:asc,name:desc" into Prisma orderBy
 *     - buildCursorArgs()   → converts a cursor ID + limit into Prisma cursor pagination
 *
 *   These are GENERIC utilities — not tied to Product specifically.
 *   Any model with sortable fields can use parseSortParam().
 *   Any model with an ID-based cursor can use buildCursorArgs().
 *
 * WHY SORTING IS A STRING?
 * ───────────────────────────────────────────────────────────────────────────
 *   The API exposes sorting via a query parameter:
 *     GET /products?sort=price:asc,createdAt:desc
 *
 *   This is a common REST API convention. The client sends a comma-separated
 *   string of "field:direction" pairs. We parse it into Prisma's orderBy format.
 *
 *   Alternative approaches:
 *     - JSON in query string: ?sort={"price":"asc"}  ← ugly, needs encoding
 *     - Separate params: ?sortField=price&sortDir=asc ← only supports single sort
 *     - GraphQL-style: ?orderBy=[{price:asc}]        ← complex for REST
 *
 *   The "field:direction" format is simple, readable, and supports multi-sort.
 *
 * SECURITY — FIELD WHITELIST:
 * ───────────────────────────────────────────────────────────────────────────
 *   parseSortParam() requires an `allowedFields` whitelist. Without it,
 *   a malicious client could sort by internal fields or cause errors:
 *     ?sort=password:asc      ← exposing sensitive data via sort order
 *     ?sort=nonExistentField  ← Prisma would throw an error
 *
 *   The whitelist ensures only known, safe fields are accepted.
 *   Any field not in the whitelist is silently ignored.
 *
 * CURSOR VS OFFSET PAGINATION:
 * ───────────────────────────────────────────────────────────────────────────
 *   Offset: "Skip 20, take 10" → page 3 of 10 items
 *     ✅ Simple, supports "jump to page 5"
 *     ❌ Slow on large datasets (DB must count/skip rows)
 *     ❌ Inconsistent if data changes between pages (inserts/deletes)
 *
 *   Cursor: "Start after record X, take 10" → next 10 after this item
 *     ✅ Fast on large datasets (uses index seek, no skip)
 *     ✅ Consistent — no missed/duplicate items when data changes
 *     ❌ No "jump to page 5" — only forward/backward
 *     ❌ More complex for the client
 *
 *   We support BOTH: offset (default) and cursor (if ?cursor= is provided).
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   In EF Core, cursor pagination looks like:
 *     var query = _dbSet
 *       .Where(p => p.Id.CompareTo(cursorId) > 0)  // after cursor
 *       .OrderBy(p => p.Id)
 *       .Take(limit);
 *
 *   In Prisma, it's built-in:
 *     prisma.product.findMany({
 *       cursor: { id: cursorId },
 *       skip: 1,        // skip the cursor record itself
 *       take: limit,
 *     });
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single Prisma orderBy entry: { fieldName: 'asc' | 'desc' } */
export type OrderByEntry = Record<string, 'asc' | 'desc'>;

/** The result of buildCursorArgs — spread this into a Prisma findMany call */
export interface CursorArgs {
  cursor: { id: string };
  skip: number;
  take: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseSortParam — Convert "price:asc,name:desc" into Prisma orderBy array
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a sort query string into a Prisma-compatible orderBy array.
 *
 * @param sort          - Comma-separated "field:direction" pairs
 *                        e.g., "price:asc,createdAt:desc"
 * @param allowedFields - Whitelist of fields that can be sorted on.
 *                        Fields not in this list are silently ignored.
 * @returns An array of orderBy objects for Prisma, or undefined if no valid sorts
 *
 * @example
 *   parseSortParam('price:asc,name:desc', ['price', 'name', 'createdAt'])
 *   // → [{ price: 'asc' }, { name: 'desc' }]
 *
 *   parseSortParam('price:asc,password:desc', ['price', 'name'])
 *   // → [{ price: 'asc' }]  — 'password' is not in the whitelist, so it's ignored
 *
 *   parseSortParam('invalid', ['price'])
 *   // → undefined  — no valid sort entries found
 *
 * HOW PRISMA MULTI-SORT WORKS:
 * ────────────────────────────────────────────────────────────────────────
 *   Prisma accepts orderBy as an ARRAY of objects (not a single object):
 *     orderBy: [{ price: 'asc' }, { name: 'desc' }]
 *
 *   This means: "sort by price ascending FIRST, then by name descending
 *   for items with the same price." Like SQL:
 *     ORDER BY price ASC, name DESC
 *
 *   In C#/EF Core:
 *     query.OrderBy(p => p.Price).ThenByDescending(p => p.Name)
 */
export function parseSortParam(
  sort: string,
  allowedFields: string[],
): OrderByEntry[] | undefined {
  // Split the comma-separated string into individual sort entries.
  // "price:asc,name:desc" → ["price:asc", "name:desc"]
  const entries = sort.split(',');

  const orderBy: OrderByEntry[] = [];

  for (const entry of entries) {
    // Split each entry into field and direction.
    // "price:asc" → ["price", "asc"]
    const [field, direction] = entry.trim().split(':');

    // Validate: field must be in the whitelist, direction must be 'asc' or 'desc'.
    // If either fails, skip this entry (don't error — be lenient on invalid sorts).
    if (
      field &&
      allowedFields.includes(field) &&
      (direction === 'asc' || direction === 'desc')
    ) {
      orderBy.push({ [field]: direction });
    }
  }

  // Return undefined if no valid entries — the caller will use a default sort.
  // This avoids passing an empty array to Prisma (which would mean "no ordering").
  return orderBy.length > 0 ? orderBy : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCursorArgs — Build Prisma cursor pagination arguments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Prisma cursor pagination arguments from a cursor ID and limit.
 *
 * @param cursor - The ID of the last item the client saw (the "cursor")
 * @param limit  - How many items to return
 * @returns An object with `cursor`, `skip`, and `take` for Prisma findMany
 *
 * @example
 *   buildCursorArgs('abc-123', 10)
 *   // → { cursor: { id: 'abc-123' }, skip: 1, take: 10 }
 *
 * WHY skip: 1?
 * ────────────────────────────────────────────────────────────────────────
 *   The cursor points to the LAST item the client already has.
 *   Without skip: 1, Prisma would include that item in the results again.
 *   skip: 1 says "start AFTER this record" — the client gets the next page.
 *
 *   Think of it like a bookmark: you don't re-read the page your bookmark
 *   is on — you start reading the NEXT page.
 *
 * HOW THE CLIENT USES THIS:
 * ────────────────────────────────────────────────────────────────────────
 *   Page 1: GET /products?limit=10
 *     → returns items 1-10, meta: { nextCursor: "id-of-item-10" }
 *
 *   Page 2: GET /products?limit=10&cursor=id-of-item-10
 *     → returns items 11-20, meta: { nextCursor: "id-of-item-20" }
 *
 *   No more pages: meta: { nextCursor: null, hasMore: false }
 */
export function buildCursorArgs(cursor: string, limit: number): CursorArgs {
  return {
    cursor: { id: cursor },
    skip: 1,   // skip the cursor record itself
    take: limit,
  };
}
