// src/middleware/notFound.ts — 404 catch-all handler (register AFTER all routes)

import { Request, Response } from 'express';
import { sendError } from '../utils/apiResponse';

/** Sends a 404 JSON response for any request that didn't match a defined route. */
export function notFound(req: Request, res: Response): void {
  sendError(
    res,
    404,
    'ROUTE_NOT_FOUND',
    `Cannot ${req.method} ${req.originalUrl}`,
  );
}
