// ── Dynamic Query Utilities for Prisma ───────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

/** A single Prisma orderBy entry: { fieldName: 'asc' | 'desc' } */
export type OrderByEntry = Record<string, 'asc' | 'desc'>;

/** Prisma cursor pagination arguments — spread into findMany calls. */
export interface CursorArgs {
  cursor: { id: string };
  skip: number;
  take: number;
}

// ── Sort Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a sort query string into a Prisma-compatible orderBy array.
 * @param sort - Comma-separated "field:direction" pairs (e.g., "price:asc,name:desc")
 * @param allowedFields - Whitelist of sortable fields; unlisted fields are ignored
 * @returns Array of orderBy objects, or undefined if no valid sorts found
 */
export function parseSortParam(
  sort: string,
  allowedFields: string[],
): OrderByEntry[] | undefined {
  const entries = sort.split(',');
  const orderBy: OrderByEntry[] = [];

  for (const entry of entries) {
    const [field, direction] = entry.trim().split(':');

    if (
      field &&
      allowedFields.includes(field) &&
      (direction === 'asc' || direction === 'desc')
    ) {
      orderBy.push({ [field]: direction });
    }
  }

  // Return undefined so callers fall back to a default sort
  return orderBy.length > 0 ? orderBy : undefined;
}

// ── Cursor Pagination ────────────────────────────────────────────────────────

/**
 * Build Prisma cursor pagination arguments.
 * @param cursor - ID of the last item the client already has
 * @param limit - Number of items to return
 * @returns Prisma-ready cursor, skip, and take values
 */
export function buildCursorArgs(cursor: string, limit: number): CursorArgs {
  return {
    cursor: { id: cursor },
    skip: 1,   // skip the cursor record itself
    take: limit,
  };
}
