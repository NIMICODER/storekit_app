// src/validators/common.validator.ts — Shared Zod Schemas

import { z } from 'zod';

// ── URL Parameter Schemas ────────────────────────────────────────────────────

/** Validates that :id is a valid UUID. */
export const idParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format for id parameter'),
});

/** Validates that :slug is a non-empty string. */
export const slugParamSchema = z.object({
  slug: z.string().min(1, 'Slug parameter is required'),
});

// ── Query String Schemas ─────────────────────────────────────────────────────

/** Validates and coerces page/limit query params with sensible defaults. */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int('Page must be a whole number')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.coerce
    .number()
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(10),
});

// ── Sort & Cursor Schemas ────────────────────────────────────────────────────

/** Validates sort format: "field:asc" or "field:desc", comma-separated. Field names validated at repo level. */
export const sortSchema = z
  .string()
  .regex(
    /^[a-zA-Z]+:(asc|desc)(,[a-zA-Z]+:(asc|desc))*$/,
    'Sort must be in format "field:asc" or "field:desc", comma-separated for multiple sorts',
  )
  .optional();

/** Validates cursor param as a UUID (ID of last item from previous page). */
export const cursorSchema = z
  .string()
  .uuid('Cursor must be a valid UUID')
  .optional();
